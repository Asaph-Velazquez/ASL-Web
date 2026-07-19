import express from 'express';
import { createServer } from 'http';
import { createServer as createHTTPServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.js';
import callsRoutes from './routes/calls.js';
import logsRoutes from './routes/logs.js';
import staysRoutes from './routes/stays.js';
import staffRoutes from './routes/staff.js';
import statsRoutes from './routes/stats.js';
import { Stay } from './models/index.js';
import { processStayTransitions } from './services/stayLifecycle.js';
import {
  listRequestsForSocket,
  persistNewRequest,
  persistRequestCancellation,
  persistRequestRating,
  persistRequestUpdate,
} from './services/requestPersistence.js';
import {
  helmetMiddleware,
  generalLimiter,
  loginLimiter,
  registerLimiter,
  corsOptions,
  sanitizeInput,
  auditLogger,
  logSecurityEvent,
  sanitizeWSMessage,
  WS_INACTIVITY_TIMEOUT
} from './middleware/security.js';
import { logOperationalError, logOperationalEvent } from './services/operationalLogs.js';

config();

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 3002;
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(helmetMiddleware);
app.use(sanitizeInput);

app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err) {
      logSecurityEvent('CORS_BLOCKED', { origin: req.headers.origin, path: req.path });
      return res.status(403).json({ error: 'Origen no permitido' });
    }
    next();
  });
});

app.use(express.json({ limit: '10kb' }));
app.use('/api', generalLimiter);

// Conexion a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asl-hotel';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado correctamente'))
  .catch(err => {
    console.error('❌ Error al conectar MongoDB:', err);
    logOperationalError('MONGODB_CONNECTION_FAILED', err, {
      source: 'server:index',
    });
  });

setInterval(() => {
  processStayTransitions()
    .then((result) => {
      if (result.ended > 0 || result.activated > 0) {
        console.log(`🔁 Rotacion de estancias: ${result.ended} finalizadas, ${result.activated} activadas`);
      }
    })
    .catch((error) => {
      console.error('❌ Error procesando rotacion de estancias:', error);
      logOperationalError('STAY_ROTATION_FAILED', error, {
        source: 'server:index',
      });
    });
}, 60 * 1000);

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/stays', staysRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/logs', logsRoutes);

// Crear servidor HTTP
const server = createServer(app);

// Servidor WebSocket
const wss = new WebSocketServer({ noServer: true });

// Estado del servidor WebSocket
// Metadatos del socket: WebSocket -> { roomNumber, guestName, stayId, isStaff }
const socketMeta = new WeakMap();
const clientes = new Set();
let configuracionApp = {
  nombreHotel: 'Canada Central Hotel',
  servicios: []
};

// Enviar mensaje a todos los clientes
function difundir(mensaje) {
  const datos = JSON.stringify(mensaje);
  clientes.forEach(cliente => {
    if (cliente.readyState === 1) {
      cliente.send(datos);
    }
  });
}

wss.on('connection', async (ws) => {
  const meta = socketMeta.get(ws);
  if (meta?.roomNumber) {
    console.log(`🔒 Huesped verificado conectado: ${meta.guestName} (Habitacion ${meta.roomNumber})`);
    logOperationalEvent('connections', 'WS_GUEST_CONNECTED', {
      stayId: meta.stayId,
      roomNumber: meta.roomNumber,
      guestName: meta.guestName,
      actor: meta.guestName,
      actorRole: 'guest',
      source: 'websocket',
      message: `Guest connected for room ${meta.roomNumber}`,
    });
  } else if (meta?.isStaff) {
    console.log('👥 Personal conectado (panel web)');
    logOperationalEvent('connections', 'WS_STAFF_CONNECTED', {
      actor: meta.username,
      actorRole: meta.role || 'staff',
      source: 'websocket',
      message: `Staff connected: ${meta.username || 'unknown'}`,
    });
  } else {
    console.log('✅ Nuevo cliente conectado');
    logOperationalEvent('connections', 'WS_CLIENT_CONNECTED', {
      source: 'websocket',
      message: 'Client connected without stay metadata',
    });
  }
  clientes.add(ws);

  ws.send(JSON.stringify({
    type: 'INIT_CONFIG',
    payload: configuracionApp
  }));

  try {
    const requests = await listRequestsForSocket(meta);
    ws.send(JSON.stringify({
      type: 'INIT_REQUESTS',
      payload: { requests },
    }));
  } catch (error) {
    console.error('❌ Error cargando historial de solicitudes:', error.message);
    logOperationalError('WS_INIT_REQUESTS_FAILED', error, {
      stayId: meta?.stayId,
      roomNumber: meta?.roomNumber,
      guestName: meta?.guestName,
      actor: meta?.username || meta?.guestName,
      actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
      source: 'websocket',
    });
  }

  const inactivityTimeout = setTimeout(() => {
    ws.close(1008, 'Inactividad prolongada');
  }, WS_INACTIVITY_TIMEOUT);

  ws.on('pong', () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout.refresh();
  });

  ws.on('message', async (datos) => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout.refresh();

    try {
      const rawData = datos.toString();
      if (rawData.length > 10000) {
        ws.send(JSON.stringify({ error: 'Mensaje demasiado grande' }));
        logOperationalError('WS_MESSAGE_TOO_LARGE', new Error('Message too large'), {
          stayId: meta?.stayId,
          roomNumber: meta?.roomNumber,
          guestName: meta?.guestName,
          actor: meta?.username || meta?.guestName,
          actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
          source: 'websocket',
        });
        return;
      }

      const mensaje = sanitizeWSMessage(JSON.parse(rawData));
      console.log('📨 Mensaje recibido:', mensaje.type);

      switch (mensaje.type) {
        case 'UPDATE_CONFIG':
          if (!socketMeta.get(ws)?.isStaff) {
            ws.send(JSON.stringify({ error: 'Unauthorized action' }));
            logOperationalError('WS_UNAUTHORIZED_CONFIG_UPDATE', new Error('Unauthorized config update'), {
              stayId: meta?.stayId,
              roomNumber: meta?.roomNumber,
              guestName: meta?.guestName,
              actor: meta?.username || meta?.guestName,
              actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
              source: 'websocket',
            });
            break;
          }
          configuracionApp = mensaje.payload;
          console.log('⚙️ Configuración actualizada');
          difundir({ type: 'CONFIG_UPDATED', payload: configuracionApp });
          break;

        case 'NEW_REQUEST':
          console.log('📥 Nueva petición recibida:', mensaje.payload?.type);
          const socketDetails = socketMeta.get(ws);
          const verifiedPayload = {
            ...mensaje.payload,
            roomNumber: socketDetails?.roomNumber || mensaje.payload.roomNumber,
            guestName: socketDetails?.guestName || mensaje.payload.guestName,
            stayId: socketDetails?.stayId || mensaje.payload.stayId || null,
            status: mensaje.payload?.status || 'pending',
            timestamp: mensaje.payload?.timestamp || new Date().toISOString(),
          };
          await persistNewRequest(verifiedPayload, socketDetails);
          logOperationalEvent('requests', 'NEW_REQUEST', {
            stayId: verifiedPayload.stayId,
            roomNumber: verifiedPayload.roomNumber,
            guestName: verifiedPayload.guestName,
            requestId: verifiedPayload.id,
            actor: socketDetails?.guestName || socketDetails?.username || verifiedPayload.guestName,
            actorRole: socketDetails?.role || (socketDetails?.isStaff ? 'staff' : 'guest'),
            source: 'websocket',
            message: verifiedPayload.message || `New request: ${verifiedPayload.type}`,
            metadata: {
              type: verifiedPayload.type,
              priority: verifiedPayload.priority || 'medium',
              status: verifiedPayload.status,
            },
          });
          difundir({ type: 'NEW_REQUEST', payload: verifiedPayload });
          break;

        case 'UPDATE_REQUEST':
          if (!socketMeta.get(ws)?.isStaff) {
            ws.send(JSON.stringify({ error: 'Unauthorized action' }));
            logOperationalError('WS_UNAUTHORIZED_REQUEST_UPDATE', new Error('Unauthorized request update'), {
              stayId: meta?.stayId,
              roomNumber: meta?.roomNumber,
              guestName: meta?.guestName,
              requestId: mensaje.payload?.id || mensaje.payload?.requestId,
              actor: meta?.username || meta?.guestName,
              actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
              source: 'websocket',
            });
            break;
          }
          console.log('🔄 Petición actualizada:', mensaje.payload?.requestId || mensaje.payload?.id);
          const updatedRequest = await persistRequestUpdate(mensaje.payload, socketMeta.get(ws));
          const updateBroadcastPayload = {
            id: updatedRequest?.requestId || mensaje.payload?.id || mensaje.payload?.requestId,
            status: updatedRequest?.status || mensaje.payload?.status,
            details: updatedRequest?.details || null,
          };
          logOperationalEvent('requests', 'UPDATE_REQUEST', {
            stayId: updatedRequest?.stayId || meta?.stayId,
            roomNumber: updatedRequest?.roomNumber || meta?.roomNumber,
            guestName: updatedRequest?.guestName || meta?.guestName,
            requestId: updatedRequest?.requestId || mensaje.payload?.id || mensaje.payload?.requestId,
            actor: meta?.username,
            actorRole: meta?.role || 'staff',
            source: 'websocket',
            message: mensaje.payload?.details?.transportResponse
              ? 'Transport response updated'
              : `Request updated to ${mensaje.payload?.status || updatedRequest?.status || 'unknown'}`,
            metadata: {
              status: updatedRequest?.status || mensaje.payload?.status,
              transportResponse: updatedRequest?.details?.transportResponse || null,
            },
          });
          difundir({ type: 'UPDATE_REQUEST', payload: updateBroadcastPayload });
          break;

        case 'CANCEL_REQUEST':
          console.log('🚫 Petición cancelada:', mensaje.payload?.requestId);
          const metaCancel = socketMeta.get(ws);
          const requestedBy = mensaje.payload?.requestedBy;
          const cancelledBy = (requestedBy === 'staff' || requestedBy === 'guest')
            ? requestedBy
            : (metaCancel?.isStaff ? 'staff' : 'guest');
          const cancelPayload = {
            ...mensaje.payload,
            cancelledBy,
            cancelledByName: cancelledBy === 'staff'
              ? (mensaje.payload?.cancelledByName || 'Personal del Hotel')
              : (metaCancel?.guestName || mensaje.payload?.guestName || 'Guest'),
            cancelledAt: new Date().toISOString(),
            status: 'cancelled'
          };
          const cancelledRequest = await persistRequestCancellation(cancelPayload, metaCancel);
          logOperationalEvent('requests', 'CANCEL_REQUEST', {
            stayId: cancelledRequest?.stayId || metaCancel?.stayId,
            roomNumber: cancelledRequest?.roomNumber || metaCancel?.roomNumber || mensaje.payload?.roomNumber,
            guestName: cancelledRequest?.guestName || metaCancel?.guestName || mensaje.payload?.guestName,
            requestId: cancelledRequest?.requestId || cancelPayload.id || cancelPayload.requestId,
            actor: cancelPayload.cancelledByName,
            actorRole: cancelPayload.cancelledBy,
            source: 'websocket',
            message: 'Request cancelled',
            metadata: {
              cancelledAt: cancelPayload.cancelledAt,
            },
          });
          difundir({ type: 'CANCEL_REQUEST', payload: cancelPayload });
          break;

        case 'RATE_REQUEST':
          console.log('⭐ Petición calificada:', mensaje.payload?.requestId);
          const ratePayload = {
            ...mensaje.payload,
            ratedAt: mensaje.payload.ratedAt || new Date().toISOString()
          };
          const ratedRequest = await persistRequestRating(ratePayload, socketMeta.get(ws));
          logOperationalEvent('requests', 'RATE_REQUEST', {
            stayId: ratedRequest?.stayId || meta?.stayId,
            roomNumber: ratedRequest?.roomNumber || meta?.roomNumber,
            guestName: ratedRequest?.guestName || meta?.guestName,
            requestId: ratedRequest?.requestId || ratePayload.id || ratePayload.requestId,
            actor: meta?.username || meta?.guestName,
            actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
            source: 'websocket',
            message: `Request rated with ${ratePayload.rating ?? 'unknown'} stars`,
            metadata: {
              rating: ratePayload.rating,
              ratedAt: ratePayload.ratedAt,
            },
          });
          difundir({ type: 'RATE_REQUEST', payload: ratePayload });
          break;

        default:
          console.log('⚠️ Tipo de mensaje no reconocido:', mensaje.type);
      }
    } catch (error) {
      console.error('❌ Error al procesar mensaje:', error.message);
      logOperationalError('WS_MESSAGE_PROCESSING_FAILED', error, {
        stayId: meta?.stayId,
        roomNumber: meta?.roomNumber,
        guestName: meta?.guestName,
        actor: meta?.username || meta?.guestName,
        actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
        source: 'websocket',
      });
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    clearTimeout(inactivityTimeout);
    console.log('🔌 Cliente desconectado');
    logOperationalEvent('connections', 'WS_CLIENT_DISCONNECTED', {
      stayId: meta?.stayId,
      roomNumber: meta?.roomNumber,
      guestName: meta?.guestName,
      actor: meta?.username || meta?.guestName,
      actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
      source: 'websocket',
      message: 'Client disconnected',
    });
    clientes.delete(ws);
  });

  ws.on('error', (error) => {
    clearTimeout(inactivityTimeout);
    console.error('❌ Error en WebSocket:', error.message);
    logOperationalError('WS_SOCKET_ERROR', error, {
      stayId: meta?.stayId,
      roomNumber: meta?.roomNumber,
      guestName: meta?.guestName,
      actor: meta?.username || meta?.guestName,
      actorRole: meta?.role || (meta?.isStaff ? 'staff' : 'guest'),
      source: 'websocket',
    });
  });
});

// Manejar el upgrade a WebSocket en el mismo servidor HTTP
// Manejar upgrade WebSocket con validacion JWT
server.on('upgrade', async (request, socket, head) => {
  try {
    await processStayTransitions();
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    // Todo cliente WebSocket debe autenticarse con JWT
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: no se proporciono token');
      logOperationalError('WS_UPGRADE_MISSING_TOKEN', new Error('Missing token'), {
        source: 'websocket-upgrade',
      });
      return;
    }

    // Validar token JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: token invalido');
      logOperationalError('WS_UPGRADE_INVALID_TOKEN', err, {
        source: 'websocket-upgrade',
      });
      return;
    }

    const { stayId, roomNumber, guestName, userId, role, username } = decoded;

    // Token de staff/admin
    if (userId && ['staff', 'admin'].includes(role)) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        socketMeta.set(ws, {
          isStaff: true,
          userId,
          username,
          role
        });
        wss.emit('connection', ws, request);
      });
      return;
    }

    // Validar estancia en base de datos
    const stay = await Stay.findOne({ stayId });
    
    if (!stay) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: estancia no encontrada');
      logOperationalError('WS_UPGRADE_STAY_NOT_FOUND', new Error('Stay not found'), {
        stayId,
        roomNumber,
        guestName,
        source: 'websocket-upgrade',
      });
      return;
    }

    if (!stay.active) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: estancia inactiva');
      logOperationalError('WS_UPGRADE_INACTIVE_STAY', new Error('Inactive stay'), {
        stayId: stay.stayId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName || guestName,
        source: 'websocket-upgrade',
      });
      return;
    }

    const now = new Date();
    if (stay.checkOut <= now) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: estancia vencida');
      logOperationalError('WS_UPGRADE_EXPIRED_STAY', new Error('Expired stay'), {
        stayId: stay.stayId,
        roomNumber: stay.roomNumber,
        guestName: stay.guestName || guestName,
        source: 'websocket-upgrade',
      });
      return;
    }

    // Token valido: aceptar conexion y guardar metadatos
    wss.handleUpgrade(request, socket, head, (ws) => {
      socketMeta.set(ws, {
        roomNumber: stay.roomNumber,
        guestName: stay.guestName || guestName,
        stayId: stay.stayId,
        isStaff: false
      });
      wss.emit('connection', ws, request);
    });
  } catch (error) {
    console.error('❌ Error during WebSocket upgrade:', error);
    logOperationalError('WS_UPGRADE_FAILED', error, {
      source: 'websocket-upgrade',
    });
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});

const startServer = (srv, port, isHTTPS, wsUrl) => {
  srv.listen(port, () => {
    console.log(`🚀 Servidor ${isHTTPS ? 'HTTPS' : 'HTTP'} + WebSocket iniciado en:`);
    console.log(`   - ${isHTTPS ? 'HTTPS' : 'HTTP'}: ${wsUrl}`);
    if (isHTTPS) {
      console.log(`   ⚠️  CERTIFICADO AUTOFIRMADO - Acepta la advertencia en el navegador`);
    }
  });
};

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Trying an alternate port...`);
    const altPort = parseInt(PORT, 10) === 3001 ? 3002 : parseInt(PORT, 10) + 1;
    startServer(server, altPort, false, `http://localhost:${altPort}`);
  } else {
    console.error('❌ Error de servidor:', err);
    logOperationalError('HTTP_SERVER_ERROR', err, {
      source: 'server:index',
    });
    process.exit(1);
  }
});

if (USE_HTTPS && existsSync('cert.pem') && existsSync('key.pem')) {
  const httpsOptions = {
    key: readFileSync('key.pem'),
    cert: readFileSync('cert.pem')
  };
  const httpsServer = createHTTPServer(httpsOptions, app);
  const httpsWss = new WebSocketServer({ noServer: true });

  httpsServer.on('error', (err) => {
    console.error('❌ Error en servidor HTTPS:', err);
    logOperationalError('HTTPS_SERVER_ERROR', err, {
      source: 'server:https',
    });
  });

  httpsServer.on('upgrade', (request, socket, head) => {
    wss.emit('upgrade', request, socket, head);
  });

  startServer(httpsServer, HTTPS_PORT, true, `https://localhost:${HTTPS_PORT}`);
  console.log(`   - WebSocket Secure: wss://localhost:${HTTPS_PORT}`);
}

startServer(server, PORT, false, `http://localhost:${PORT}`);

process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  wss.close(() => {
    mongoose.connection.close();
    console.log('👋 Servidor cerrado');
    process.exit(0);
  });
});

