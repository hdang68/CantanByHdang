import crypto from 'node:crypto';
import { createStandardBoard, createRandomBoard } from './game/board.js';
import { CatanEngine } from './game/engine.js';

// Danh sách phòng lưu trong RAM
const rooms = new Map();

// Bảng màu cho tối đa 4 người chơi theo Catan Classic
export const PLAYER_COLORS = [
  { name: 'Red', hex: '#e74c3c' },
  { name: 'Blue', hex: '#3498db' },
  { name: 'Orange', hex: '#e67e22' },
  { name: 'White', hex: '#ecf0f1' }
];

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
    color: PLAYER_COLORS[0],
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
  const colorIndex = room.players.length;

  const newPlayer = {
    id: playerId,
    name: playerName.trim().slice(0, 20) || `Người chơi ${room.players.length + 1}`,
    socketId,
    sessionToken,
    color: PLAYER_COLORS[colorIndex],
    isHost: false,
    connected: true
  };

  room.players.push(newPlayer);
  return { room, player: newPlayer };
}

export function startGameInRoom(roomId, requestingSocketId) {
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

  // Khởi tạo Game Engine
  room.engine = new CatanEngine(room.players, { board: room.board });
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
  }

  return { room, removedPlayer };
}

export function getRoomPublicView(room) {
  if (!room) return null;
  return {
    id: room.id,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.isHost,
      connected: p.connected
    })),
    board: room.board
  };
}
