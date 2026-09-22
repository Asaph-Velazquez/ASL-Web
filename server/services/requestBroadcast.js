import { sendRequestMessage } from './socketInitialization.js';

export function publicRequest(request) {
  const { creationFingerprint, ...visible } = request;
  return { ...visible, id: request.requestId };
}

export function broadcastRequest(message, request, clients, socketMeta) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    const meta = socketMeta.get(client);
    if (client.readyState === 1 && (meta?.isStaff
      || (meta?.stayId && request?.stayId && meta.stayId === request.stayId))) {
      sendRequestMessage(client, data);
    }
  }
}
