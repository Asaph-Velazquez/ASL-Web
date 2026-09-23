import { useEffect, useRef, useState, useCallback } from 'react';

// Interfaces
interface MensajeWebSocket {
  type: string;
  payload: unknown;
  operationId?: string;
}

interface RetornoUseWebSocket {
  estaConectado: boolean;
  enviarMensaje: (mensaje: MensajeWebSocket) => boolean;
  ultimoMensaje: MensajeWebSocket | null;
}

export function useWebSocket(url: string, token?: string | null, onMessage?: (message: MensajeWebSocket) => void): RetornoUseWebSocket {
  const messageListener = useRef(onMessage);
  useEffect(() => { messageListener.current = onMessage; }, [onMessage]);
  const [estaConectado, setEstaConectado] = useState(false);
  const [ultimoMensaje, setUltimoMensaje] = useState<MensajeWebSocket | null>(null);
  const refWs = useRef<WebSocket | null>(null);
  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const conectar = () => {
    if (disposed) return;
    try {
      const wsUrl = token
        ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
        : url;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (disposed) return;
        setEstaConectado(true);
        attempts = 0;
      };

      ws.onmessage = (evento) => {
        if (disposed) return;
        try {
          const mensaje = JSON.parse(evento.data);
          if (!mensaje || typeof mensaje.type !== 'string') return;
          messageListener.current?.(mensaje);
          setUltimoMensaje(mensaje);
        } catch {
          // Ignore malformed frames; only valid messages update application state.
          return;
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setEstaConectado(false);
        refWs.current = null;

        // Reconexión automática
        if (attempts < 5) {
          const timeout = Math.min(1000 * Math.pow(2, attempts), 30000);
          
          retryTimer = setTimeout(() => {
            attempts++;
            conectar();
          }, timeout);
        }
      };

      refWs.current = ws;
    } catch {
      setEstaConectado(false);
    }
    };
    conectar();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      refWs.current?.close();
      refWs.current = null;
    };
  }, [url, token]);

  const enviarMensaje = useCallback((mensaje: MensajeWebSocket) => {
    if (refWs.current && refWs.current.readyState === WebSocket.OPEN) {
      try {
        refWs.current.send(JSON.stringify(mensaje));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  return { estaConectado, enviarMensaje, ultimoMensaje };
}
