import express from 'express';
import { createServer } from 'http';
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
// Cargar variables de entorno
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Rutas de API
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

// Manejador de conexiones WebSocket
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

  // Escuchar mensajes
  ws.on('message', (datos) => {
    try {
      const mensaje = JSON.parse(datos.toString());
      console.log('📨 Mensaje recibido:', mensaje);

      switch (mensaje.type) {
        case 'UPDATE_CONFIG':
          configuracionApp = mensaje.payload;
          console.log('⚙️ Configuración actualizada');
          
          difundir({
            type: 'CONFIG_UPDATED',
            payload: configuracionApp
          });
          break;

        case 'NEW_REQUEST':
          console.log('📥 Nueva petición recibida:', mensaje.payload);
          // Inyectar roomNumber y guestName verificados por el servidor
          const meta = socketMeta.get(ws);
          const verifiedPayload = {
            ...mensaje.payload,
            roomNumber: meta?.roomNumber || mensaje.payload.roomNumber,
            guestName: meta?.guestName || mensaje.payload.guestName
          };
          
          difundir({
            type: 'NEW_REQUEST',
            payload: verifiedPayload
          });
          break;

        case 'UPDATE_REQUEST':
          console.log('🔄 Petición actualizada:', mensaje.payload);
          difundir({
            type: 'UPDATE_REQUEST',
            payload: mensaje.payload
          });
          break;

        case 'CANCEL_REQUEST':
          console.log('🚫 Petición cancelada:', mensaje.payload);
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
          
          difundir({
            type: 'CANCEL_REQUEST',
            payload: cancelPayload
          });
          break;

        case 'RATE_REQUEST':
          console.log('⭐ Petición calificada:', mensaje.payload);
          const ratePayload = {
            ...mensaje.payload,
            ratedAt: mensaje.payload.ratedAt || new Date().toISOString()
          };
          
          difundir({
            type: 'RATE_REQUEST',
            payload: ratePayload
          });
          break;

        default:
          console.log('⚠️ Tipo de mensaje no reconocido:', mensaje.type);
      }
    } catch (error) {
      console.error('❌ Error al procesar mensaje:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Cliente desconectado');
    clientes.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ Error en WebSocket:', error);
  });
});

// Manejar el upgrade a WebSocket en el mismo servidor HTTP
// Manejar upgrade WebSocket con validacion JWT
server.on('upgrade', async (request, socket, head) => {
  try {
    await processStayTransitions();
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    // Si no hay token, detectar si es panel web o app movil
    if (!token) {
      const userAgent = request.headers['user-agent'] || '';
      const isMobileApp = userAgent.includes('okhttp') || userAgent.includes('Expo') || userAgent.includes('ReactNative');
      
      if (isMobileApp) {
        // Permitir conexion inicial de app movil sin token (se autentica por mensaje)
        wss.handleUpgrade(request, socket, head, (ws) => {
          socketMeta.set(ws, { isStaff: false, isMobile: true });
          wss.emit('connection', ws, request);
        });
        return;
      }

      const isDashboard = !userAgent.includes('okhttp') && !userAgent.includes('Expo');
      if (isDashboard) {
        // Permitir panel web (staff) sin token de huesped
        wss.handleUpgrade(request, socket, head, (ws) => {
          socketMeta.set(ws, { isStaff: true });
          wss.emit('connection', ws, request);
        });
        return;
      } else {
        // La app movil debe enviar token
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        console.log('❌ Conexion WebSocket rechazada: no se proporciono token');
        return;
      }
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

    const { stayId, roomNumber, guestName } = decoded;

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

// Iniciar servidor con manejo de error EADDRINUSE
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Trying an alternate port...`);
    const altPort = parseInt(PORT, 10) === 3001 ? 3002 : parseInt(PORT, 10) + 1;
    server.listen(altPort, () => {
      console.log(`🚀 Servidor HTTP + WebSocket iniciado en:`);
      console.log(`   - HTTP: http://localhost:${altPort}`);
      console.log(`   - WebSocket: ws://localhost:${altPort}`);
    });
  } else {
    console.error('❌ Error de servidor:', err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP + WebSocket iniciado en:`);
  console.log(`   - HTTP: http://localhost:${PORT}`);
  console.log(`   - WebSocket: ws://localhost:${PORT}`);
});

// Cierre del servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  wss.close(() => {
    mongoose.connection.close();
    console.log('👋 Servidor cerrado');
    process.exit(0);
  });
});
