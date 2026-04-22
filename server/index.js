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
import staysRoutes from './routes/stays.js';
import staffRoutes from './routes/staff.js';
import { Stay } from './models/index.js';
import { processStayTransitions } from './services/stayLifecycle.js';
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
  .catch(err => console.error('❌ Error al conectar MongoDB:', err));

setInterval(() => {
  processStayTransitions()
    .then((result) => {
      if (result.ended > 0 || result.activated > 0) {
        console.log(`🔁 Rotacion de estancias: ${result.ended} finalizadas, ${result.activated} activadas`);
      }
    })
    .catch((error) => {
      console.error('❌ Error procesando rotacion de estancias:', error);
    });
}, 60 * 1000);

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stays', staysRoutes);
app.use('/api/staff', staffRoutes);

// Crear servidor HTTP
const server = createServer(app);

// Servidor WebSocket
const wss = new WebSocketServer({ noServer: true });

// Estado del servidor WebSocket
// Metadatos del socket: WebSocket -> { roomNumber, guestName, stayId, isStaff }
const socketMeta = new WeakMap();
const clientes = new Set();
let configuracionApp = {
  nombreHotel: 'Hotel ASL Grand',
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

wss.on('connection', (ws) => {
  const meta = socketMeta.get(ws);
  if (meta?.roomNumber) {
    console.log(`🔒 Huesped verificado conectado: ${meta.guestName} (Habitacion ${meta.roomNumber})`);
  } else if (meta?.isStaff) {
    console.log('👥 Personal conectado (panel web)');
  } else {
    console.log('✅ Nuevo cliente conectado');
  }
  clientes.add(ws);

  ws.send(JSON.stringify({
    type: 'INIT_CONFIG',
    payload: configuracionApp
  }));

  const inactivityTimeout = setTimeout(() => {
    ws.close(1008, 'Inactividad prolongada');
  }, WS_INACTIVITY_TIMEOUT);

  ws.on('pong', () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout.refresh();
  });

  ws.on('message', (datos) => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout.refresh();

    try {
      const rawData = datos.toString();
      if (rawData.length > 10000) {
        ws.send(JSON.stringify({ error: 'Mensaje demasiado grande' }));
        return;
      }

      const mensaje = sanitizeWSMessage(JSON.parse(rawData));
      console.log('📨 Mensaje recibido:', mensaje.type);

      switch (mensaje.type) {
        case 'UPDATE_CONFIG':
          if (!socketMeta.get(ws)?.isStaff) {
            ws.send(JSON.stringify({ error: 'Unauthorized action' }));
            break;
          }
          configuracionApp = mensaje.payload;
          console.log('⚙️ Configuración actualizada');
          difundir({ type: 'CONFIG_UPDATED', payload: configuracionApp });
          break;

        case 'NEW_REQUEST':
          console.log('📥 Nueva petición recibida:', mensaje.payload?.type);
          const meta = socketMeta.get(ws);
          const verifiedPayload = {
            ...mensaje.payload,
            roomNumber: meta?.roomNumber || mensaje.payload.roomNumber,
            guestName: meta?.guestName || mensaje.payload.guestName
          };
          difundir({ type: 'NEW_REQUEST', payload: verifiedPayload });
          break;

        case 'UPDATE_REQUEST':
          if (!socketMeta.get(ws)?.isStaff) {
            ws.send(JSON.stringify({ error: 'Unauthorized action' }));
            break;
          }
          console.log('🔄 Petición actualizada:', mensaje.payload?.requestId);
          difundir({ type: 'UPDATE_REQUEST', payload: mensaje.payload });
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
              : (metaCancel?.guestName || mensaje.payload?.guestName || 'Huésped'),
            cancelledAt: new Date().toISOString(),
            status: 'cancelled'
          };
          difundir({ type: 'CANCEL_REQUEST', payload: cancelPayload });
          break;

        case 'RATE_REQUEST':
          console.log('⭐ Petición calificada:', mensaje.payload?.requestId);
          const ratePayload = {
            ...mensaje.payload,
            ratedAt: mensaje.payload.ratedAt || new Date().toISOString()
          };
          difundir({ type: 'RATE_REQUEST', payload: ratePayload });
          break;

        default:
          console.log('⚠️ Tipo de mensaje no reconocido:', mensaje.type);
      }
    } catch (error) {
      console.error('❌ Error al procesar mensaje:', error.message);
      ws.send(JSON.stringify({ error: 'Formato de mensaje inválido' }));
    }
  });

  ws.on('close', () => {
    clearTimeout(inactivityTimeout);
    console.log('🔌 Cliente desconectado');
    clientes.delete(ws);
  });

  ws.on('error', (error) => {
    clearTimeout(inactivityTimeout);
    console.error('❌ Error en WebSocket:', error.message);
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
      return;
    }

    if (!stay.active) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: estancia inactiva');
      return;
    }

    const now = new Date();
    if (stay.checkOut <= now) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ Conexion WebSocket rechazada: estancia vencida');
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
