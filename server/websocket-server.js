import { WebSocketServer } from 'ws';

const PUERTO = 8080;
const wss = new WebSocketServer({ port: PUERTO });

console.log(`🚀 Servidor WebSocket iniciado en ws://localhost:${PUERTO}`);

// Estado del servidor
const clientes = new Set();
let configuracionApp = {
  nombreHotel: 'Hotel ASL Grand',
  servicios: []
};

// Manejador de conexiones
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

// Enviar mensaje a todos los clientes
function difundir(mensaje) {
  const datos = JSON.stringify(mensaje);
  clientes.forEach(cliente => {
    if (cliente.readyState === 1) {
      cliente.send(datos);
    }
  });
}

// Cierre del servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor WebSocket...');
  wss.close(() => {
    console.log('👋 Servidor cerrado');
    process.exit(0);
  });
});
