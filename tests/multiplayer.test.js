import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as Client } from 'socket.io-client';
import express from 'express';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../src/socketHandlers.js';

test('Full Multiplayer Realtime Flow with Socket.IO', async (t) => {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  setupSocketHandlers(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const serverUrl = `http://localhost:${port}`;

  let clientAlice, clientBob;
  let roomId = null;
  let aliceToken = null;
  let bobToken = null;

  await t.test('Alice and Bob connect and establish room', async () => {
    clientAlice = Client(serverUrl);
    clientBob = Client(serverUrl);

    await Promise.all([
      new Promise((res) => clientAlice.on('connect', res)),
      new Promise((res) => clientBob.on('connect', res))
    ]);

    // Alice creates room
    const createRes = await new Promise((res) => {
      clientAlice.emit('room:create', { playerName: 'Alice' }, res);
    });

    assert.equal(createRes.success, true);
    roomId = createRes.room.id;
    aliceToken = createRes.player.sessionToken;
    assert.ok(aliceToken);

    // Bob joins room
    const joinRes = await new Promise((res) => {
      clientBob.emit('room:join', { roomId, playerName: 'Bob' }, res);
    });

    assert.equal(joinRes.success, true);
    bobToken = joinRes.player.sessionToken;
    assert.ok(bobToken);
  });

  await t.test('Host Alice starts game and clients receive filtered state', async () => {
    const aliceStatePromise = new Promise((res) => clientAlice.once('game:state', res));
    const bobStatePromise = new Promise((res) => clientBob.once('game:state', res));

    const startRes = await new Promise((res) => {
      clientAlice.emit('game:start', {}, res);
    });
    assert.equal(startRes.success, true);

    const [aliceState, bobState] = await Promise.all([aliceStatePromise, bobStatePromise]);

    assert.equal(aliceState.phase, 'SETUP_ROUND_1');
    assert.equal(bobState.phase, 'SETUP_ROUND_1');

    // Kiểm tra tính bảo mật: Bob không nhìn thấy chi tiết thẻ bài của Alice
    const aliceFromBobPerspective = bobState.players[clientAlice.id] || Object.values(bobState.players).find(p => p.name === 'Alice');
    assert.ok(aliceFromBobPerspective);
    assert.equal(aliceFromBobPerspective.resources, undefined, 'Bob must NOT see Alice private resource map');
    assert.equal(typeof aliceFromBobPerspective.totalResourceCount, 'number', 'Bob only sees total count');
  });

  await t.test('Setup Phase actions executed over WebSockets', async () => {
    // Alice builds first settlement at v_0
    const aliceStatePromise = new Promise((res) => clientAlice.once('game:state', res));
    const buildRes1 = await new Promise((res) => {
      clientAlice.emit('game:setup_settlement', { vertexId: 'v_0' }, res);
    });
    assert.equal(buildRes1.success, true);
    const updatedState1 = await aliceStatePromise;
    assert.equal(updatedState1.board.vertices['v_0'].building !== null, true);

    // Alice builds road at adjacent edge
    const v0 = updatedState1.board.vertices['v_0'];
    const adjEdgeId = v0.adjacentEdgeIds[0];

    const bobId = Object.values(updatedState1.players).find(p => p.name === 'Bob').id;
    const bobTurnPromise = new Promise((resolve) => {
      const handler = (st) => {
        if (st.currentTurnPlayerId === bobId) {
          clientBob.off('game:state', handler);
          resolve(st);
        }
      };
      clientBob.on('game:state', handler);
    });

    const buildRoadRes = await new Promise((res) => {
      clientAlice.emit('game:setup_road', { edgeId: adjEdgeId }, res);
    });
    assert.equal(buildRoadRes.success, true);

    const bobTurnState = await bobTurnPromise;
    assert.equal(bobTurnState.currentTurnPlayerId, bobId);
  });

  await t.test('Player Reconnection using Session Token', async () => {
    // Bob disconnects
    clientBob.disconnect();

    // Client mới của Bob kết nối lại và gửi token phiên
    const clientBobReconnected = Client(serverUrl);
    await new Promise((res) => clientBobReconnected.on('connect', res));

    const reconnectRes = await new Promise((res) => {
      clientBobReconnected.emit('player:reconnect', { roomId, sessionToken: bobToken }, res);
    });

    assert.equal(reconnectRes.success, true);
    assert.equal(reconnectRes.player.name, 'Bob');

    clientBobReconnected.disconnect();
  });

  // Teardown
  if (clientAlice) clientAlice.disconnect();
  await new Promise((resolve) => httpServer.close(resolve));
});
