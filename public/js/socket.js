// Socket.IO Client Wrapper
let socket = null;
let currentLatency = 0;

export function initSocket({
  onConnect,
  onDisconnect,
  onRoomState,
  onGameState,
  onTradeProposal,
  onTradeUpdate,
  onConnectError
}) {
  socket = window.io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    if (onConnect) onConnect(socket.id);
  });

  socket.on('disconnect', (reason) => {
    if (onDisconnect) onDisconnect(reason);
  });

  socket.on('connect_error', (err) => {
    if (onConnectError) onConnectError(err);
  });

  socket.on('room:state', (roomState) => {
    if (onRoomState) onRoomState(roomState);
  });

  socket.on('game:state', (gameState) => {
    if (onGameState) onGameState(gameState);
  });

  socket.on('trade:proposal', (tradeOffer) => {
    if (onTradeProposal) onTradeProposal(tradeOffer);
  });

  socket.on('trade:update', (tradeUpdate) => {
    if (onTradeUpdate) onTradeUpdate(tradeUpdate);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function measurePing() {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve(-1);
      return;
    }
    const start = performance.now();
    socket.emit('client:ping', { timestamp: Date.now() }, () => {
      const latency = Math.round(performance.now() - start);
      currentLatency = latency;
      resolve(latency);
    });
  });
}

export function emitAsync(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('Chưa kết nối tới máy chủ.'));
      return;
    }

    socket.emit(event, data, (response) => {
      if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}
