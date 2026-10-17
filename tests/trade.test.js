import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as Client } from 'socket.io-client';
import express from 'express';
import { Server } from 'socket.io';
import { setupSocketHandlers } from '../src/socketHandlers.js';
import { getRoom } from '../src/rooms.js';

test('Player-to-player 1-step Trade: Offer and Accept completes trade immediately', async () => {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  setupSocketHandlers(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const serverUrl = `http://localhost:${port}`;

  const clientAlice = Client(serverUrl);
  const clientBob = Client(serverUrl);

  await Promise.all([
    new Promise((res) => clientAlice.on('connect', res)),
    new Promise((res) => clientBob.on('connect', res))
  ]);

  // Alice creates room
  const createRes = await new Promise((res) => {
    clientAlice.emit('room:create', { playerName: 'Alice' }, res);
  });
  assert.equal(createRes.success, true);
  const roomId = createRes.room.id;
  const aliceId = createRes.player.id;

  // Bob joins room
  const joinRes = await new Promise((res) => {
    clientBob.emit('room:join', { roomId, playerName: 'Bob' }, res);
  });
  assert.equal(joinRes.success, true);
  const bobId = joinRes.player.id;

  // Alice starts game
  const startRes = await new Promise((res) => {
    clientAlice.emit('game:start', { randomizeTurnOrder: false }, res);
  });
  assert.equal(startRes.success, true);

  const room = getRoom(roomId);
  assert.ok(room && room.engine);

  // Directly set engine phase to TURN_MAIN and give players resources for trade testing
  room.engine.phase = 'TURN_MAIN';
  room.engine.currentTurnPlayerId = aliceId;
  room.engine.players[aliceId].resources = { wood: 2, clay: 1, sheep: 0, wheat: 0, ore: 0 };
  room.engine.players[bobId].resources = { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 2 };

  // Setup listener on Bob for trade proposal
  const bobProposalPromise = new Promise((resolve) => {
    clientBob.once('trade:proposal', resolve);
  });

  // Alice sends trade offer to Bob: 1 wood for 1 ore
  const offerRes = await new Promise((resolve) => {
    clientAlice.emit('game:trade_offer', {
      give: { wood: 1, clay: 0, sheep: 0, wheat: 0, ore: 0 },
      receive: { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 1 },
      targetPlayerId: bobId
    }, resolve);
  });
  assert.equal(offerRes.success, true);

  const receivedProposal = await bobProposalPromise;
  assert.equal(receivedProposal.give.wood, 1);
  assert.equal(receivedProposal.receive.ore, 1);
  assert.equal(receivedProposal.senderId, aliceId);

  // Setup listener for trade:update on Alice and Bob
  const aliceTradeUpdatePromise = new Promise((resolve) => {
    clientAlice.once('trade:update', resolve);
  });
  const bobTradeUpdatePromise = new Promise((resolve) => {
    clientBob.once('trade:update', resolve);
  });

  // Bob accepts offer - Should COMPLETE IMMEDIATELY without Alice needing to confirm
  const respondRes = await new Promise((resolve) => {
    clientBob.emit('game:trade_respond', { accept: true }, resolve);
  });
  assert.equal(respondRes.success, true);
  assert.equal(respondRes.completed, true);

  const [aliceUpdate, bobUpdate] = await Promise.all([aliceTradeUpdatePromise, bobTradeUpdatePromise]);
  assert.equal(aliceUpdate.status, 'COMPLETED');
  assert.equal(bobUpdate.status, 'COMPLETED');

  // Verify resources transferred
  assert.equal(room.engine.players[aliceId].resources.wood, 1);
  assert.equal(room.engine.players[aliceId].resources.ore, 1);
  assert.equal(room.engine.players[bobId].resources.wood, 1);
  assert.equal(room.engine.players[bobId].resources.ore, 1);

  // Verify activeTrade is cleared
  assert.equal(room.activeTrade, null);

  // Test 2: Alice sends another offer, Bob rejects -> Cancels immediately
  const bobProposalPromise2 = new Promise((resolve) => {
    clientBob.once('trade:proposal', resolve);
  });
  const aliceTradeRejectPromise = new Promise((resolve) => {
    clientAlice.once('trade:update', resolve);
  });

  const offerRes2 = await new Promise((resolve) => {
    clientAlice.emit('game:trade_offer', {
      give: { wood: 1, clay: 0, sheep: 0, wheat: 0, ore: 0 },
      receive: { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 1 },
      targetPlayerId: bobId
    }, resolve);
  });
  assert.equal(offerRes2.success, true);
  await bobProposalPromise2;

  const rejectRes = await new Promise((resolve) => {
    clientBob.emit('game:trade_respond', { accept: false }, resolve);
  });
  assert.equal(rejectRes.success, true);
  assert.equal(rejectRes.rejected, true);

  const rejectUpdate = await aliceTradeRejectPromise;
  assert.equal(rejectUpdate.status, 'REJECTED');
  assert.equal(room.activeTrade, null);

  // Teardown
  clientAlice.disconnect();
  clientBob.disconnect();
  await new Promise((resolve) => httpServer.close(resolve));
});
