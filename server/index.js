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
// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/asl-hotel';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado correctamente'))
  .catch(err => console.error('❌ Error al conectar MongoDB:', err));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stays', staysRoutes);
app.use('/api/staff', staffRoutes);

// Create HTTP server
const server = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Estado del servidor WebSocket
// Socket metadata: maps WebSocket -> { roomNumber, guestName, stayId, isStaff }
const socketMeta = new WeakMap();

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
    console.log(`🔒 Verified guest connected: ${meta.guestName} (Room ${meta.roomNumber})`);
  } else if (meta?.isStaff) {
    console.log('👥 Staff member connected (web dashboard)');
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
          // Inject server-verified roomNumber and guestName
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

        case 'UPDATE_REQUEST':
          console.log('🔄 Petición actualizada:', mensaje.payload);
          difundir({
            type: 'UPDATE_REQUEST',
            payload: mensaje.payload
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

// Handle WebSocket upgrade on the same HTTP server
// Handle WebSocket upgrade with JWT validation
server.on('upgrade', async (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    // If no token provided, check if this is a web dashboard connection (staff)
    if (!token) {
      const userAgent = request.headers['user-agent'] || '';
      const isDashboard = !userAgent.includes('okhttp') && !userAgent.includes('Expo');
      
      if (isDashboard) {
        // Allow web dashboard (staff) to connect without guest token
        wss.handleUpgrade(request, socket, head, (ws) => {
          socketMeta.set(ws, { isStaff: true });
          wss.emit('connection', ws, request);
        });
        return;
      } else {
        // Mobile app must provide token
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        console.log('❌ WebSocket connection rejected: no token provided');
        return;
      }
    }

    // Validate JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ WebSocket connection rejected: invalid token');
      return;
    }

    const { stayId, roomNumber, guestName } = decoded;

    // Validate stay in database
    const stay = await Stay.findOne({ stayId });
    
    if (!stay) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ WebSocket connection rejected: stay not found');
      return;
    }

    if (!stay.active) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ WebSocket connection rejected: stay inactive');
      return;
    }

    const now = new Date();
    if (stay.checkOut <= now) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log('❌ WebSocket connection rejected: stay expired');
      return;
    }

    // Token valid, accept connection and store metadata
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

// Start server with error handling for EADDRINUSE
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
    console.error('❌ Server error:', err);
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
