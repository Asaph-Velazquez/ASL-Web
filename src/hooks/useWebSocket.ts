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
        setEstaConectado(true);
        refIntentosReconexion.current = 0;
      };

      ws.onmessage = (evento) => {
        try {
          const mensaje = JSON.parse(evento.data);
          setUltimoMensaje(mensaje);
        } catch (error) {
        }
      };

      ws.onerror = (error) => {
      };

      ws.onclose = () => {
        setEstaConectado(false);
        refWs.current = null;

        // Reconexión automática
        if (refIntentosReconexion.current < maxIntentosReconexion) {
          const timeout = Math.min(1000 * Math.pow(2, refIntentosReconexion.current), 30000);
          
          refTimeoutReconexion.current = setTimeout(() => {
            refIntentosReconexion.current++;
            conectar();
          }, timeout);
        } else {
        }
      };

      refWs.current = ws;
    } catch (error) {
    }
  }, [url]);

  const enviarMensaje = useCallback((mensaje: MensajeWebSocket) => {
    if (refWs.current && refWs.current.readyState === WebSocket.OPEN) {
      refWs.current.send(JSON.stringify(mensaje));
    } else {
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
