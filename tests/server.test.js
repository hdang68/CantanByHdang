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

  await t.test('Lobby: Host toggles 5-6 Player Extension, room expands to 6 slots', async () => {
    // Bob (host) enables 5-6 player extension
    const enable56 = await new Promise((resolve) => {
      client2.emit('room:toggle_56_extension', { is56: true }, resolve);
    });
    assert.equal(enable56.success, true);
    assert.equal(enable56.is56Extension, true);
    assert.equal(enable56.maxPlayers, 6);
    assert.equal(Object.keys(enable56.room.board.hexes).length, 30);

    // Connect clients 3, 4, 5, 6
    const client3 = Client(`http://localhost:${port}`);
    const client4 = Client(`http://localhost:${port}`);
    const client5 = Client(`http://localhost:${port}`);
    const client6 = Client(`http://localhost:${port}`);

    await Promise.all([
      new Promise(r => client3.on('connect', r)),
      new Promise(r => client4.on('connect', r)),
      new Promise(r => client5.on('connect', r)),
      new Promise(r => client6.on('connect', r))
    ]);

    const j3 = await new Promise(r => client3.emit('room:join', { roomId: createdRoomId, playerName: 'Player3' }, r));
    const j4 = await new Promise(r => client4.emit('room:join', { roomId: createdRoomId, playerName: 'Player4' }, r));
    const j5 = await new Promise(r => client5.emit('room:join', { roomId: createdRoomId, playerName: 'Player5' }, r));
    const j6 = await new Promise(r => client6.emit('room:join', { roomId: createdRoomId, playerName: 'Player6' }, r));

    assert.equal(j3.success, true);
    assert.equal(j4.success, true);
    assert.equal(j5.success, true);
    assert.equal(j6.success, true);
    assert.equal(j6.room.players.length, 5); // Bob + Player3 + Player4 + Player5 + Player6 = 5 players

    // Host tries to disable 5-6 extension when room has > 4 players -> must fail
    const disableFail = await new Promise(r => client2.emit('room:toggle_56_extension', { is56: false }, r));
    assert.equal(disableFail.success, false);
    assert.ok(disableFail.error);

    // Clean up extra clients
    client3.disconnect();
    client4.disconnect();
    client5.disconnect();
    client6.disconnect();
  });

  await t.test('Lobby: Host selects Basic or Seafarers game mode (10 vs 12 VP)', async () => {
    // client2 is host of createdRoomId
    // Non-host (client1 is not even in room, but let's test invalid host or client2)
    const setSeafarers = await new Promise(r => client2.emit('room:set_game_mode', { gameMode: 'seafarers' }, r));
    assert.equal(setSeafarers.success, true);
    assert.equal(setSeafarers.gameMode, 'seafarers');
    assert.equal(setSeafarers.targetVictoryPoints, 12);
    assert.equal(setSeafarers.room.gameMode, 'seafarers');
    assert.equal(setSeafarers.room.targetVictoryPoints, 12);

    // Switch back to basic
    const setBasic = await new Promise(r => client2.emit('room:set_game_mode', { gameMode: 'basic' }, r));
    assert.equal(setBasic.success, true);
    assert.equal(setBasic.gameMode, 'basic');
    assert.equal(setBasic.targetVictoryPoints, 10);
    assert.equal(setBasic.room.gameMode, 'basic');
    assert.equal(setBasic.room.targetVictoryPoints, 10);
  });

  // Teardown
  if (client1) client1.disconnect();
  if (client2) client2.disconnect();
  await new Promise((resolve) => httpServer.close(resolve));
});
