import crypto from 'node:crypto';
import { createStandardBoard, createRandomBoard } from './game/board.js';
import { CatanEngine } from './game/engine.js';

// Danh sách phòng lưu trong RAM
const rooms = new Map();

// Bảng màu hỗ trợ cho người chơi Catan (4 màu kinh điển + màu mở rộng)
export const AVAILABLE_PLAYER_COLORS = [
  { name: 'Đỏ', hex: '#e74c3c' },
  { name: 'Xanh dương', hex: '#3498db' },
  { name: 'Cam', hex: '#e67e22' },
  { name: 'Trắng', hex: '#ecf0f1' },
  { name: 'Xanh lá', hex: '#2ecc71' },
  { name: 'Tím', hex: '#9b59b6' }
];

export const PLAYER_COLORS = AVAILABLE_PLAYER_COLORS.slice(0, 4);

export function generateRoomId(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

export function createRoom(hostPlayerName, socketId, isRandomBoard = false) {
  let roomId = generateRoomId();
  while (rooms.has(roomId)) {
    roomId = generateRoomId();
  }

  const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
  const sessionToken = generateSessionToken();

  const hostPlayer = {
    id: playerId,
    name: hostPlayerName.trim().slice(0, 20) || 'Người chơi 1',
    socketId,
    sessionToken,
    color: { ...AVAILABLE_PLAYER_COLORS[0] },
    isHost: true,
    connected: true
  };

  const board = isRandomBoard ? createRandomBoard() : createStandardBoard();

  const room = {
    id: roomId,
    status: 'LOBBY', // 'LOBBY' | 'PLAYING' | 'FINISHED'
    createdAt: Date.now(),
    hostId: playerId,
    players: [hostPlayer],
    board,
    boardMode: isRandomBoard ? 'RANDOM' : 'STANDARD',
    engine: null
  };

  rooms.set(roomId, room);
  return { room, player: hostPlayer };
}

export function getRoom(roomId) {
  if (!roomId) return null;
  return rooms.get(roomId.toUpperCase()) || null;
}

export function joinRoom(roomId, playerName, socketId) {
  const room = getRoom(roomId);
  if (!room) {
    return { error: 'Không tìm thấy phòng chơi này.' };
  }

  if (room.status !== 'LOBBY') {
    return { error: 'Ván chơi trong phòng này đã bắt đầu.' };
  }

  if (room.players.length >= 4) {
    return { error: 'Phòng đã đủ 4 người chơi.' };
  }

  const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
  const sessionToken = generateSessionToken();

  // Chọn màu chưa được người chơi khác trong phòng sử dụng
  const usedHexes = room.players.map(p => p.color?.hex?.toLowerCase());
  const assignedColor = AVAILABLE_PLAYER_COLORS.find(c => !usedHexes.includes(c.hex.toLowerCase())) || AVAILABLE_PLAYER_COLORS[0];

  const newPlayer = {
    id: playerId,
    name: playerName.trim().slice(0, 20) || `Người chơi ${room.players.length + 1}`,
    socketId,
    sessionToken,
    color: { ...assignedColor },
    isHost: false,
    connected: true
  };

  room.players.push(newPlayer);
  return { room, player: newPlayer };
}

export function startGameInRoom(roomId, requestingSocketId, options = {}) {
  const room = getRoom(roomId);
  if (!room) {
    return { success: false, error: 'Phòng không tồn tại.' };
  }

  const requestingPlayer = room.players.find(p => p.socketId === requestingSocketId);
  if (!requestingPlayer || !requestingPlayer.isHost) {
    return { success: false, error: 'Chỉ có chủ phòng mới có quyền bắt đầu ván đấu.' };
  }

  if (room.status !== 'LOBBY') {
    return { success: false, error: 'Ván đấu đã bắt đầu rồi.' };
  }

  if (room.players.length < 2) {
    return { success: false, error: 'Cần ít nhất 2 người chơi để bắt đầu (khuyên dùng 3-4 người).' };
  }

  // Khởi tạo Game Engine (Mặc định xáo trộn ngẫu nhiên thứ tự chơi khi vào game)
  const shouldRandomizeOrder = options.randomizeTurnOrder !== false;
  room.engine = new CatanEngine(room.players, {
    board: room.board,
    randomizeTurnOrder: shouldRandomizeOrder
  });

  // Đồng bộ danh sách người chơi trong phòng theo thứ tự lượt chơi ngẫu nhiên
  if (room.engine?.turnOrder) {
    const orderMap = new Map(room.engine.turnOrder.map((id, index) => [id, index]));
    room.players.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }

  room.status = 'PLAYING';

  return { success: true, room };
}

export function reconnectPlayer(roomId, sessionToken, newSocketId) {
  const room = getRoom(roomId);
  if (!room) {
    return { success: false, error: 'Phòng không tồn tại hoặc đã bị hủy.' };
  }

  const player = room.players.find(p => p.sessionToken === sessionToken);
  if (!player) {
    return { success: false, error: 'Token phiên không hợp lệ.' };
  }

  player.socketId = newSocketId;
  player.connected = true;

  return { success: true, room, player };
}

export function leaveRoom(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return null;

  const playerIndex = room.players.findIndex(p => p.socketId === socketId);
  if (playerIndex === -1) return null;

  const removedPlayer = room.players[playerIndex];

  // Nếu trong sảnh chờ thì xóa hẳn
  if (room.status === 'LOBBY') {
    room.players.splice(playerIndex, 1);
    if (room.players.length === 0) {
      rooms.delete(room.id);
      return { room: null, removedPlayer };
    } else if (removedPlayer.isHost) {
      room.players[0].isHost = true;
      room.hostId = room.players[0].id;
    }
  } else {
    // Nếu đang chơi thì chỉ đánh dấu mất kết nối, giữ nguyên slot và quân cờ
    removedPlayer.connected = false;

    // Nếu người chơi ngắt kết nối khi đang phải bỏ bài ra 7, tự động bỏ bài để không làm treo ván chơi của cả phòng
    if (room.engine) {
      if (room.engine.phase === 'TURN_ROBBER_DISCARD' && room.engine.pendingDiscards?.[removedPlayer.id]) {
        room.engine.autoDiscardForPlayer(removedPlayer.id);
      }
      if (room.engine.phase === 'TURN_ROBBER_STEAL') {
        room.engine.checkAndAdvanceFromSteal();
      }
    }
  }

  return { room, removedPlayer };
}

export function randomizeRoomBoard(roomId, requestingSocketId) {
  const room = getRoom(roomId);
  if (!room) return { success: false, error: 'Phòng không tồn tại.' };
  if (room.status !== 'LOBBY') return { success: false, error: 'Chỉ có thể đổi bản đồ khi đang ở sảnh chờ.' };

  const requestingPlayer = room.players.find(p => p.socketId === requestingSocketId);
  if (!requestingPlayer || !requestingPlayer.isHost) {
    return { success: false, error: 'Chỉ chủ phòng mới có quyền đổi bản đồ.' };
  }

  room.board = createRandomBoard();
  room.boardMode = 'RANDOM';
  return { success: true, room };
}

export function setStandardRoomBoard(roomId, requestingSocketId) {
  const room = getRoom(roomId);
  if (!room) return { success: false, error: 'Phòng không tồn tại.' };
  if (room.status !== 'LOBBY') return { success: false, error: 'Chỉ có thể đổi bản đồ khi đang ở sảnh chờ.' };

  const requestingPlayer = room.players.find(p => p.socketId === requestingSocketId);
  if (!requestingPlayer || !requestingPlayer.isHost) {
    return { success: false, error: 'Chỉ chủ phòng mới có quyền đổi bản đồ.' };
  }

  room.board = createStandardBoard();
  room.boardMode = 'STANDARD';
  return { success: true, room };
}

export function changePlayerColor(roomId, requestingSocketId, newColorHex) {
  const room = getRoom(roomId);
  if (!room) return { success: false, error: 'Phòng không tồn tại.' };
  if (room.status !== 'LOBBY') return { success: false, error: 'Chỉ có thể đổi màu khi đang ở sảnh chờ.' };

  const player = room.players.find(p => p.socketId === requestingSocketId);
  if (!player) return { success: false, error: 'Không tìm thấy người chơi.' };

  const targetColor = AVAILABLE_PLAYER_COLORS.find(c => c.hex.toLowerCase() === (newColorHex || '').toLowerCase());
  if (!targetColor) return { success: false, error: 'Màu đã chọn không hợp lệ.' };

  const isTaken = room.players.some(p => p.id !== player.id && p.color?.hex?.toLowerCase() === targetColor.hex.toLowerCase());
  if (isTaken) {
    return { success: false, error: `Màu ${targetColor.name} đã có người chơi khác chọn.` };
  }

  player.color = { ...targetColor };
  return { success: true, room, player };
}

export function getRoomPublicView(room) {
  if (!room) return null;
  return {
    id: room.id,
    status: room.status,
    hostId: room.hostId,
    boardMode: room.boardMode || 'STANDARD',
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.isHost,
      connected: p.connected
    })),
    board: room.board,
    availableColors: AVAILABLE_PLAYER_COLORS
  };
}
