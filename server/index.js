import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from 'dotenv';
import authRoutes from './routes/auth.js';
import staysRoutes from './routes/stays.js';
import staffRoutes from './routes/staff.js';

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
  console.log('✅ Nuevo cliente conectado');
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
          
          difundir({
            type: 'NEW_REQUEST',
            payload: mensaje.payload
          });
          break;

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
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Start server
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
