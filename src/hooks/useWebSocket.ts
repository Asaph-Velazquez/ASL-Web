import { useEffect, useRef, useState, useCallback } from 'react';

// Interfaces
interface MensajeWebSocket {
  type: string;
  payload: any;
}

interface RetornoUseWebSocket {
  estaConectado: boolean;
  enviarMensaje: (mensaje: MensajeWebSocket) => void;
  ultimoMensaje: MensajeWebSocket | null;
}

export function useWebSocket(url: string): RetornoUseWebSocket {
  const [estaConectado, setEstaConectado] = useState(false);
  const [ultimoMensaje, setUltimoMensaje] = useState<MensajeWebSocket | null>(null);
  const refWs = useRef<WebSocket | null>(null);
  const refTimeoutReconexion = useRef<number | undefined>(undefined);
  const refIntentosReconexion = useRef(0);
  const maxIntentosReconexion = 5;

  // Conexión WebSocket
  const conectar = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('✅ WebSocket conectado');
        setEstaConectado(true);
        refIntentosReconexion.current = 0;
      };

      ws.onmessage = (evento) => {
        try {
          const mensaje = JSON.parse(evento.data);
          console.log('📨 Mensaje recibido:', mensaje);
          setUltimoMensaje(mensaje);
        } catch (error) {
          console.error('Error al parsear mensaje:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket desconectado');
        setEstaConectado(false);
        refWs.current = null;

        // Reconexión automática
        if (refIntentosReconexion.current < maxIntentosReconexion) {
          const timeout = Math.min(1000 * Math.pow(2, refIntentosReconexion.current), 30000);
          console.log(`🔄 Reintentando conexión en ${timeout}ms...`);
          
          refTimeoutReconexion.current = setTimeout(() => {
            refIntentosReconexion.current++;
            conectar();
          }, timeout);
        } else {
          console.log('❌ Máximo de intentos de reconexión alcanzado');
        }
      };

      refWs.current = ws;
    } catch (error) {
      console.error('Error al crear WebSocket:', error);
    }
  }, [url]);

  const enviarMensaje = useCallback((mensaje: MensajeWebSocket) => {
    if (refWs.current && refWs.current.readyState === WebSocket.OPEN) {
      refWs.current.send(JSON.stringify(mensaje));
      console.log('📤 Mensaje enviado:', mensaje);
    } else {
      console.warn('⚠️ WebSocket no está conectado. No se puede enviar mensaje.');
    }
  }, []);

  useEffect(() => {
    conectar();

    return () => {
      if (refTimeoutReconexion.current) {
        clearTimeout(refTimeoutReconexion.current);
      }
      if (refWs.current) {
        refWs.current.close();
      }
    };
  }, [conectar]);

  return { estaConectado, enviarMensaje, ultimoMensaje };
}
