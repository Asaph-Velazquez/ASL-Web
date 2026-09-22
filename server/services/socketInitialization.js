const initializing = new WeakMap();

export function sendRequestMessage(socket, data) {
  const state = initializing.get(socket);
  if (state) {
    if (state.outgoing.length >= 200) {
      state.stopped = true;
      socket.close(1013, 'Initialization queue full');
    } else if (!state.stopped) state.outgoing.push(data);
  } else if (socket.readyState === 1) socket.send(data);
}

// Install the listener synchronously, then load history. Both incoming operations
// and outgoing broadcasts wait for INIT_REQUESTS, preventing snapshot rollback.
export function initializeSocket(socket, loadHistory, handleMessage, onError = () => {}) {
  const state = { outgoing: [], stopped: false };
  initializing.set(socket, state);
  socket.once('close', () => { state.stopped = true; initializing.delete(socket); });
  let pending = 0;
  const ready = Promise.resolve().then(loadHistory).then(() => {
    if (!state.stopped && socket.readyState === 1) {
      for (const data of state.outgoing) socket.send(data);
    }
    state.outgoing.length = 0;
    initializing.delete(socket);
  }).catch(error => {
    state.stopped = true;
    state.outgoing.length = 0;
    initializing.delete(socket);
    onError(error);
    socket.close(1011, 'Request initialization failed; reconnect');
  });
  let chain = ready;
  socket.on('message', data => {
    if (state.stopped) return;
    if (pending >= 100 || data.length > 10000) {
      state.stopped = true;
      socket.close(1009, 'Message queue limit exceeded');
      return;
    }
    pending += 1;
    chain = chain.then(async () => {
      if (!state.stopped && socket.readyState === 1) await handleMessage(data);
    }).catch(error => {
      state.stopped = true;
      onError(error);
      socket.close(1011, 'Message processing failed');
    }).finally(() => { pending -= 1; });
  });
  return ready;
}
