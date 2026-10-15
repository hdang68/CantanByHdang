import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomPublicView,
  startGameInRoom,
  reconnectPlayer,
  randomizeRoomBoard,
  setStandardRoomBoard,
  changePlayerColor
} from './rooms.js';
import { executePlayerTrade, createTradeOffer } from './game/trading.js';

/**
 * Phát sóng trạng thái đã lọc bảo mật cho từng người chơi trong phòng
 */
export function broadcastGameState(io, room) {
  if (!room || !room.engine) return;

  try {
    const publicRoom = getRoomPublicView(room);
    io.to(room.id).emit('room:state', publicRoom);

    room.players.forEach(player => {
      if (player.connected && player.socketId) {
        try {
          const filteredView = room.engine.getPlayerView(player.id);
          io.to(player.socketId).emit('game:state', filteredView);
        } catch (playerErr) {
          console.error(`[Broadcast] Lỗi gửi state cho người chơi ${player.id}:`, playerErr);
        }
      }
    });
  } catch (err) {
    console.error('[Broadcast] Lỗi phát sóng trạng thái phòng:', err);
  }
}

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Kết nối mới: ${socket.id}`);

    // Gửi thông báo chào mừng
    socket.emit('server:connected', {
      socketId: socket.id,
      timestamp: Date.now()
    });

    // Ping - Pong kiểm tra độ trễ
    socket.on('client:ping', (data, callback) => {
      const response = {
        clientTime: data?.timestamp || 0,
        serverTime: Date.now()
      };
      if (typeof callback === 'function') callback(response);
      else socket.emit('server:pong', response);
    });

    // 1. Tạo phòng
    socket.on('room:create', ({ playerName, isRandomBoard }, callback) => {
      try {
        const { room, player } = createRoom(playerName || 'Chủ phòng', socket.id, isRandomBoard);
        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.playerId = player.id;
        socket.data.sessionToken = player.sessionToken;

        const publicView = getRoomPublicView(room);
        console.log(`[Room] Phòng ${room.id} được tạo bởi ${player.name}`);

        if (typeof callback === 'function') {
          callback({
            success: true,
            room: publicView,
            player: {
              id: player.id,
              name: player.name,
              sessionToken: player.sessionToken,
              color: player.color,
              isHost: player.isHost
            }
          });
        }
      } catch (err) {
        console.error('[Room] Lỗi tạo phòng:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Không thể tạo phòng lúc này.' });
      }
    });

    // 2. Vào phòng
    socket.on('room:join', ({ roomId, playerName }, callback) => {
      try {
        const result = joinRoom(roomId, playerName || 'Người chơi', socket.id);
        if (result.error) {
          if (typeof callback === 'function') callback({ success: false, error: result.error });
          return;
        }

        const { room, player } = result;
        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.playerId = player.id;
        socket.data.sessionToken = player.sessionToken;

        const publicView = getRoomPublicView(room);
        console.log(`[Room] ${player.name} tham gia phòng ${room.id}`);

        io.to(room.id).emit('room:state', publicView);

        if (typeof callback === 'function') {
          callback({
            success: true,
            room: publicView,
            player: {
              id: player.id,
              name: player.name,
              sessionToken: player.sessionToken,
              color: player.color,
              isHost: player.isHost
            }
          });
        }
      } catch (err) {
        console.error('[Room] Lỗi tham gia phòng:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Lỗi khi tham gia phòng.' });
      }
    });

    // 3. Khôi phục phiên kết nối lại (Reconnect)
    socket.on('player:reconnect', ({ roomId, sessionToken }, callback) => {
      try {
        const result = reconnectPlayer(roomId, sessionToken, socket.id);
        if (!result.success) {
          if (typeof callback === 'function') callback(result);
          return;
        }

        const { room, player } = result;
        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.playerId = player.id;
        socket.data.sessionToken = player.sessionToken;

        console.log(`[Reconnect] ${player.name} (${player.id}) đã kết nối lại phòng ${room.id}`);

        const publicView = getRoomPublicView(room);
        socket.emit('room:state', publicView);

        if (room.engine) {
          const filteredView = room.engine.getPlayerView(player.id);
          socket.emit('game:state', filteredView);
        }

        if (typeof callback === 'function') {
          callback({
            success: true,
            room: publicView,
            player: {
              id: player.id,
              name: player.name,
              sessionToken: player.sessionToken,
              color: player.color,
              isHost: player.isHost
            }
          });
        }
      } catch (err) {
        console.error('[Reconnect] Lỗi kết nối lại:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Lỗi khôi phục phiên.' });
      }
    });
    // 3B. Đổi bản đồ ngẫu nhiên trong sảnh chờ (Chỉ chủ phòng)
    socket.on('room:randomize_board', (callback) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Bạn chưa vào phòng.' });
          return;
        }
        const result = randomizeRoomBoard(roomId, socket.id);
        if (!result.success) {
          if (typeof callback === 'function') callback(result);
          return;
        }
        const publicView = getRoomPublicView(result.room);
        console.log(`[Room] Chủ phòng đã sinh bản đồ ngẫu nhiên cho phòng ${roomId}`);
        io.to(roomId).emit('room:state', publicView);
        if (typeof callback === 'function') callback({ success: true, room: publicView });
      } catch (err) {
        console.error('[Room] Lỗi đổi map ngẫu nhiên:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Không thể đổi bản đồ lúc này.' });
      }
    });

    // 3C. Đặt về bản đồ tiêu chuẩn trong sảnh chờ (Chỉ chủ phòng)
    socket.on('room:standard_board', (callback) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Bạn chưa vào phòng.' });
          return;
        }
        const result = setStandardRoomBoard(roomId, socket.id);
        if (!result.success) {
          if (typeof callback === 'function') callback(result);
          return;
        }
        const publicView = getRoomPublicView(result.room);
        console.log(`[Room] Chủ phòng đã đặt lại bản đồ tiêu chuẩn cho phòng ${roomId}`);
        io.to(roomId).emit('room:state', publicView);
        if (typeof callback === 'function') callback({ success: true, room: publicView });
      } catch (err) {
        console.error('[Room] Lỗi đặt map tiêu chuẩn:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Không thể đặt bản đồ lúc này.' });
      }
    });

    // 3D. Người chơi đổi màu quân cờ trong sảnh chờ
    socket.on('room:change_color', ({ colorHex }, callback) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Bạn chưa vào phòng.' });
          return;
        }
        const result = changePlayerColor(roomId, socket.id, colorHex);
        if (!result.success) {
          if (typeof callback === 'function') callback(result);
          return;
        }
        const publicView = getRoomPublicView(result.room);
        console.log(`[Room] Người chơi ${result.player.name} (${result.player.id}) đổi sang màu ${result.player.color.name} (${result.player.color.hex}) trong phòng ${roomId}`);
        io.to(roomId).emit('room:state', publicView);
        if (typeof callback === 'function') callback({ success: true, room: publicView, player: result.player });
      } catch (err) {
        console.error('[Room] Lỗi đổi màu người chơi:', err);
        if (typeof callback === 'function') callback({ success: false, error: 'Không thể đổi màu lúc này.' });
      }
    });

    // 4. Bắt đầu ván đấu
    socket.on('game:start', (data, callback) => {
      let options = {};
      let cb = callback;
      if (typeof data === 'function') {
        cb = data;
        options = {};
      } else if (data && typeof data === 'object') {
        options = data;
      }

      const roomId = socket.data.roomId;
      const room = getRoom(roomId);
      if (!room) {
        if (typeof cb === 'function') cb({ success: false, error: 'Không tìm thấy phòng.' });
        return;
      }

      const result = startGameInRoom(roomId, socket.id, options);
      if (!result.success) {
        if (typeof cb === 'function') cb(result);
        return;
      }

      console.log(`[Game] Ván đấu trong phòng ${roomId} chính thức bắt đầu!`);
      broadcastGameState(io, room);

      if (typeof cb === 'function') cb({ success: true });
    });

    // Helper thực thi hành động Game Engine
    function handleEngineAction(actionFn, callback) {
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      const room = getRoom(roomId);

      if (!room || !room.engine) {
        if (typeof callback === 'function') callback({ success: false, error: 'Ván chơi chưa bắt đầu.' });
        return;
      }

      const result = actionFn(room.engine, playerId);
      if (result.success) {
        broadcastGameState(io, room);
      }
      if (typeof callback === 'function') callback(result);
    }

    // 5. Giai đoạn khởi đầu (Setup Phase)
    socket.on('game:setup_settlement', ({ vertexId }, callback) => {
      handleEngineAction((engine, pId) => engine.setupBuildSettlement(pId, vertexId), callback);
    });

    socket.on('game:setup_road', ({ edgeId }, callback) => {
      handleEngineAction((engine, pId) => engine.setupBuildRoad(pId, edgeId), callback);
    });

    // 6. Gieo xúc xắc
    socket.on('game:roll_dice', (data, callback) => {
      handleEngineAction((engine, pId) => engine.rollDice(pId), callback);
    });

    // 7. Bỏ bài khi xúc xắc ra 7
    socket.on('game:discard', ({ resources }, callback) => {
      handleEngineAction((engine, pId) => engine.discardResources(pId, resources), callback);
    });

    // 8. Di chuyển Tên cướp & Cướp tài nguyên
    socket.on('game:move_robber', ({ hexId }, callback) => {
      handleEngineAction((engine, pId) => engine.moveRobber(pId, hexId), callback);
    });

    socket.on('game:steal', ({ targetPlayerId }, callback) => {
      handleEngineAction((engine, pId) => engine.stealResource(pId, targetPlayerId), callback);
    });

    // 9. Xây dựng công trình trong lượt chính
    socket.on('game:build_road', ({ edgeId }, callback) => {
      handleEngineAction((engine, pId) => engine.buildRoad(pId, edgeId), callback);
    });

    socket.on('game:build_settlement', ({ vertexId }, callback) => {
      handleEngineAction((engine, pId) => engine.buildSettlement(pId, vertexId), callback);
    });

    socket.on('game:build_city', ({ vertexId }, callback) => {
      handleEngineAction((engine, pId) => engine.buildCity(pId, vertexId), callback);
    });

    // 10. Thẻ phát triển (Development Cards)
    socket.on('game:buy_dev_card', (data, callback) => {
      handleEngineAction((engine, pId) => engine.buyDevCardAction(pId), callback);
    });

    socket.on('game:play_knight', (data, callback) => {
      handleEngineAction((engine, pId) => engine.playKnight(pId), callback);
    });

    socket.on('game:play_year_of_plenty', ({ res1, res2 }, callback) => {
      handleEngineAction((engine, pId) => engine.playYearOfPlenty(pId, res1, res2), callback);
    });

    socket.on('game:play_monopoly', ({ targetResource }, callback) => {
      handleEngineAction((engine, pId) => engine.playMonopoly(pId, targetResource), callback);
    });

    // 11. Giao dịch qua Cảng / Ngân hàng
    socket.on('game:trade_bank', ({ giveResource, getResource }, callback) => {
      handleEngineAction((engine, pId) => engine.tradeWithBankAction(pId, giveResource, getResource), callback);
    });

    // 12. Giao dịch giữa các người chơi
    socket.on('game:trade_offer', ({ give, receive, targetPlayerId }, callback) => {
      const room = getRoom(socket.data.roomId);
      if (!room || !room.engine) return;

      const player = room.engine.players[socket.data.playerId];
      const result = createTradeOffer(player, { give, receive, targetPlayerId });

      if (result.success) {
        room.activeTrade = result.tradeOffer;
        // Phát thông điệp đề xuất đổi bài tới đối thủ
        io.to(room.id).emit('trade:proposal', result.tradeOffer);
      }
      if (typeof callback === 'function') callback(result);
    });

    socket.on('game:trade_respond', ({ accept }, callback) => {
      const room = getRoom(socket.data.roomId);
      if (!room || !room.activeTrade) return;

      const pId = socket.data.playerId;
      if (accept) {
        if (!room.activeTrade.acceptedPlayerIds.includes(pId)) {
          room.activeTrade.acceptedPlayerIds.push(pId);
        }
      } else {
        if (!room.activeTrade.rejectedPlayerIds.includes(pId)) {
          room.activeTrade.rejectedPlayerIds.push(pId);
        }
      }

      io.to(room.id).emit('trade:update', room.activeTrade);
      if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('game:trade_confirm', ({ partnerId }, callback) => {
      const room = getRoom(socket.data.roomId);
      if (!room || !room.activeTrade || !room.engine) return;

      const playerA = room.engine.players[socket.data.playerId];
      const playerB = room.engine.players[partnerId];

      if (!playerA || !playerB) {
        if (typeof callback === 'function') callback({ success: false, error: 'Người chơi không hợp lệ.' });
        return;
      }

      const result = executePlayerTrade(playerA, playerB, room.activeTrade);
      if (result.success) {
        room.engine.lastPlayerTrade = {
          id: `player_trade_${Date.now()}_${Math.random()}`,
          playerAId: playerA.id,
          playerBId: playerB.id,
          give: { ...room.activeTrade.give },
          receive: { ...room.activeTrade.receive }
        };
        room.activeTrade = null;
        io.to(room.id).emit('trade:update', null);
        broadcastGameState(io, room);
      }
      if (typeof callback === 'function') callback(result);
    });

    socket.on('game:trade_cancel', (data, callback) => {
      const room = getRoom(socket.data.roomId);
      if (room && room.activeTrade) {
        room.activeTrade = null;
        io.to(room.id).emit('trade:update', null);
      }
      if (typeof callback === 'function') callback({ success: true });
    });

    // 13. Kết thúc lượt
    socket.on('game:end_turn', (data, callback) => {
      const room = getRoom(socket.data.roomId);
      if (room && room.activeTrade) {
        room.activeTrade = null;
        io.to(room.id).emit('trade:update', null);
      }
      handleEngineAction((engine, pId) => engine.endTurn(pId), callback);
    });

    // 14. Rời phòng & Ngắt kết nối
    socket.on('room:leave', (callback) => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const result = leaveRoom(roomId, socket.id);
        socket.leave(roomId);
        delete socket.data.roomId;

        if (result && result.room) {
          io.to(roomId).emit('room:state', getRoomPublicView(result.room));
        }
      }
      if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Ngắt kết nối: ${socket.id} (${reason})`);
      const roomId = socket.data.roomId;
      if (roomId) {
        const result = leaveRoom(roomId, socket.id);
        if (result && result.room) {
          io.to(roomId).emit('room:state', getRoomPublicView(result.room));
          if (result.room.engine) {
            broadcastGameState(io, result.room);
          }
        }
      }
    });
  });
}
