import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as Client } from 'socket.io-client';
import express from 'express';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../src/socketHandlers.js';
import { createStandardBoard, createRandomBoard } from '../src/game/board.js';

test('Server & Socket.IO Multiplayer Infrastructure', async (t) => {
  // Setup server for testing
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  setupSocketHandlers(io);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', game: 'Catan Classic Online' });
  });

  app.get('/api/board/standard', (req, res) => {
    res.json(createStandardBoard());
  });

  app.get('/api/board/random', (req, res) => {
    res.json(createRandomBoard());
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const serverUrl = `http://localhost:${port}`;

  await t.test('Health check endpoint returns HTTP 200 and valid JSON', async () => {
    const res = await fetch(`${serverUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.game, 'Catan Classic Online');
  });

  await t.test('Board endpoints return valid 19-hex board data', async () => {
    const resStd = await fetch(`${serverUrl}/api/board/standard`);
    assert.equal(resStd.status, 200);
    const dataStd = await resStd.json();
    assert.equal(Object.keys(dataStd.hexes).length, 19);
    assert.equal(Object.keys(dataStd.vertices).length, 54);
    assert.equal(Object.keys(dataStd.edges).length, 72);

    const resRnd = await fetch(`${serverUrl}/api/board/random`);
    assert.equal(resRnd.status, 200);
    const dataRnd = await resRnd.json();
    assert.equal(Object.keys(dataRnd.hexes).length, 19);
    assert.equal(Object.keys(dataRnd.vertices).length, 54);
    assert.equal(Object.keys(dataRnd.edges).length, 72);
  });

  let client1, client2;

  await t.test('Socket.IO connection and ping/pong', async () => {
    client1 = Client(serverUrl);
    await new Promise((resolve) => client1.on('connect', resolve));
    assert.ok(client1.id);

    const pongPromise = new Promise((resolve) => {
      client1.emit('client:ping', { timestamp: 12345 }, (res) => {
        resolve(res);
      });
    });

    const res = await pongPromise;
    assert.equal(res.clientTime, 12345);
    assert.ok(typeof res.serverTime === 'number');
  });

  let createdRoomId = null;

  await t.test('Host creates a new room', async () => {
    const createRes = await new Promise((resolve) => {
      client1.emit('room:create', { playerName: 'Alice' }, resolve);
    });

    assert.equal(createRes.success, true);
    assert.ok(createRes.room.id);
    assert.equal(createRes.room.players.length, 1);
    assert.equal(createRes.room.players[0].name, 'Alice');
    assert.equal(createRes.room.players[0].isHost, true);
    createdRoomId = createRes.room.id;
  });

  await t.test('Second player joins the room', async () => {
    client2 = Client(serverUrl);
    await new Promise((resolve) => client2.on('connect', resolve));

    const joinRes = await new Promise((resolve) => {
      client2.emit('room:join', { roomId: createdRoomId, playerName: 'Bob' }, resolve);
    });

    assert.equal(joinRes.success, true);
    assert.equal(joinRes.room.players.length, 2);
    assert.equal(joinRes.room.players[1].name, 'Bob');
    assert.equal(joinRes.room.players[1].isHost, false);
  });

  await t.test('Cannot join with invalid room ID', async () => {
    const invalidJoinRes = await new Promise((resolve) => {
      client2.emit('room:join', { roomId: 'NONEXISTENT', playerName: 'Charlie' }, resolve);
    });

    assert.equal(invalidJoinRes.success, false);
    assert.ok(invalidJoinRes.error);
  });

  await t.test('Host toggles board mode to RANDOM and back to STANDARD', async () => {
    // Chuyển sang RANDOM
    const randomRes = await new Promise((resolve) => {
      client1.emit('room:toggle_board_mode', { isRandom: true }, resolve);
    });
    assert.equal(randomRes.success, true);
    assert.equal(randomRes.boardMode, 'RANDOM');
    assert.equal(randomRes.room.boardMode, 'RANDOM');

    // Chuyển lại về STANDARD
    const standardRes = await new Promise((resolve) => {
      client1.emit('room:toggle_board_mode', { isRandom: false }, resolve);
    });
    assert.equal(standardRes.success, true);
    assert.equal(standardRes.boardMode, 'STANDARD');
    assert.equal(standardRes.room.boardMode, 'STANDARD');
  });

  await t.test('Second player leaves the room', async () => {
    const leaveRes = await new Promise((resolve) => {
      client2.emit('room:leave', {}, resolve);
    });
    assert.equal(leaveRes.success, true);
  });

  await t.test('Lobby: Player can change color and cannot pick taken color', async () => {
    // Re-join client2 as Bob
    const joinRes = await new Promise((resolve) => {
      client2.emit('room:join', { roomId: createdRoomId, playerName: 'Bob' }, resolve);
    });
    assert.equal(joinRes.success, true);

    // Alice is red (#e74c3c). Bob tries to pick red -> fails
    const failChange = await new Promise((resolve) => {
      client2.emit('room:change_color', { colorHex: '#e74c3c' }, resolve);
    });
    assert.equal(failChange.success, false);
    assert.ok(failChange.error);

    // Bob picks green (#2ecc71) -> succeeds
    const successChange = await new Promise((resolve) => {
      client2.emit('room:change_color', { colorHex: '#2ecc71' }, resolve);
    });
    assert.equal(successChange.success, true);
    assert.equal(successChange.player.color.hex, '#2ecc71');
  });

  await t.test('Lobby: When host leaves, remaining player is promoted to host', async () => {
    // Alice (host, client1) leaves the room
    const hostLeave = await new Promise((resolve) => {
      client1.emit('room:leave', {}, resolve);
    });
    assert.equal(hostLeave.success, true);

    // Bob (client2) is now host!
    const pingBob = await new Promise((resolve) => {
      client2.emit('room:toggle_board_mode', { isRandom: true }, resolve);
    });
    assert.equal(pingBob.success, true);
    assert.equal(pingBob.room.players[0].name, 'Bob');
    assert.equal(pingBob.room.players[0].isHost, true);
  });

  // Teardown
  if (client1) client1.disconnect();
  if (client2) client2.disconnect();
  await new Promise((resolve) => httpServer.close(resolve));
});
