import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatanEngine, GAME_PHASES } from '../src/game/engine.js';
import { DEV_CARD_TYPES } from '../src/game/developmentCards.js';

test('Robber: Move Robber to new hex with no victims transitions to TURN_MAIN', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_ROBBER_MOVE;
  engine.diceRolledThisTurn = true;

  const initialRobberHex = engine.board.robberHexId;
  const targetHexId = Object.keys(engine.board.hexes).find(id => id !== initialRobberHex);

  // Thử di chuyển lại vào ô cũ -> Phải bị từ chối
  const sameHexRes = engine.moveRobber('p1', initialRobberHex);
  assert.equal(sameHexRes.success, false);
  assert.match(sameHexRes.error, /khác/);

  // Di chuyển sang ô mới không có công trình kề bên
  const moveRes = engine.moveRobber('p1', targetHexId);
  assert.equal(moveRes.success, true);
  assert.equal(moveRes.mustSteal, false);
  assert.equal(engine.phase, GAME_PHASES.TURN_MAIN);
  assert.equal(engine.board.robberHexId, targetHexId);
});

test('Robber: Move Robber to hex with adjacent victims transitions to TURN_ROBBER_STEAL and steals resource', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_ROBBER_MOVE;
  engine.diceRolledThisTurn = true;

  const targetHexId = Object.keys(engine.board.hexes).find(id => id !== engine.board.robberHexId);
  const hex = engine.board.hexes[targetHexId];
  const vId = hex.vertexIds[0];

  // Đặt khu định cư của Bob kề bên ô này và cấp tài nguyên cho Bob
  engine.board.vertices[vId].building = { playerId: 'p2', type: 'settlement' };
  engine.players.p2.resources = { wood: 2, clay: 1, sheep: 0, wheat: 0, ore: 0 };
  engine.players.p1.resources = { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 };

  const moveRes = engine.moveRobber('p1', targetHexId);
  assert.equal(moveRes.success, true);
  assert.equal(moveRes.mustSteal, true);
  assert.equal(moveRes.victims.length, 1);
  assert.equal(moveRes.victims[0].id, 'p2');
  assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_STEAL);

  // Alice cướp tài nguyên của Bob
  const stealRes = engine.stealResource('p1', 'p2');
  assert.equal(stealRes.success, true);
  assert.ok(stealRes.stolenResource === 'wood' || stealRes.stolenResource === 'clay');

  // Kiểm tra tài nguyên đã được chuyển từ Bob sang Alice
  assert.equal(engine.players.p1.resources[stealRes.stolenResource], 1);
  assert.equal(engine.players.p2.resources[stealRes.stolenResource], stealRes.stolenResource === 'wood' ? 1 : 0);
  assert.equal(engine.phase, GAME_PHASES.TURN_MAIN);
});

test('Robber: Knight played before dice roll returns to TURN_ROLL after moving robber and stealing', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_ROLL;
  engine.diceRolledThisTurn = false;
  engine.turnNumber = 2; // Không phải turn mua thẻ

  // Cấp thẻ Knight mua từ turn trước cho Alice
  engine.players.p1.devCards.push({
    id: 'dev_1',
    type: DEV_CARD_TYPES.KNIGHT,
    turnBought: 1,
    isPlayed: false
  });

  // Đánh thẻ Knight trước khi gieo xúc xắc
  const knightRes = engine.playKnight('p1');
  assert.equal(knightRes.success, true);
  assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_MOVE);
  assert.equal(engine.diceRolledThisTurn, false);

  // Di chuyển Tên cướp (không có nạn nhân)
  const initialRobberHex = engine.board.robberHexId;
  const targetHexId = Object.keys(engine.board.hexes).find(id => id !== initialRobberHex);
  const moveRes = engine.moveRobber('p1', targetHexId);
  assert.equal(moveRes.success, true);

  // Vì chưa gieo xúc xắc, phase PHẢI quay về TURN_ROLL để người chơi gieo xúc xắc!
  assert.equal(engine.phase, GAME_PHASES.TURN_ROLL);

  // Bây giờ người chơi có thể gieo xúc xắc bình thường
  const rollRes = engine.rollDice('p1');
  assert.equal(rollRes.success, true);
  assert.equal(engine.diceRolledThisTurn, true);
});

test('Robber: Disconnected player auto-discards so game is never stuck in TURN_ROBBER_DISCARD', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_ROLL;

  // Bob có 8 thẻ tài nguyên -> cần bỏ 4 thẻ
  engine.players.p2.resources = { wood: 4, clay: 4, sheep: 0, wheat: 0, ore: 0 };
  engine.players.p1.resources = { wood: 2, clay: 2, sheep: 0, wheat: 0, ore: 0 };

  const originalRandom = Math.random;
  try {
    let callCount = 0;
    Math.random = () => {
      callCount++;
      return (callCount % 2 === 1) ? 0.55 : 0.35; // Tổng = 7
    };

    const rollRes = engine.rollDice('p1');
    assert.equal(rollRes.isSeven, true);
    assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_DISCARD);
    assert.equal(engine.pendingDiscards['p2'], 4);

    // Bob bị mất kết nối -> Gọi autoDiscardForPlayer
    const autoDiscardRes = engine.autoDiscardForPlayer('p2');
    assert.equal(autoDiscardRes.success, true);

    // Kiểm tra Bob đã bị trừ 4 thẻ và game chuyển mượt sang TURN_ROBBER_MOVE
    const remainingBobCards = Object.values(engine.players.p2.resources).reduce((a, b) => a + b, 0);
    assert.equal(remainingBobCards, 4);
    assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_MOVE);
  } finally {
    Math.random = originalRandom;
  }
});

test('Turn Order: Randomize turn order shuffles player IDs', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
    { id: 'p4', name: 'David' }
  ];

  // Kiểm tra không random -> Giữ nguyên thứ tự ban đầu
  const normalEngine = new CatanEngine(players, { randomizeTurnOrder: false });
  assert.deepEqual(normalEngine.turnOrder, ['p1', 'p2', 'p3', 'p4']);

  // Kiểm tra random -> Tạo nhiều lần, ít nhất 1 lần thứ tự bị xáo trộn khác ban đầu
  let wasShuffled = false;
  for (let i = 0; i < 20; i++) {
    const randomEngine = new CatanEngine(players, { randomizeTurnOrder: true });
    assert.equal(randomEngine.turnOrder.length, 4);
    // Phải chứa đủ 4 người chơi
    assert.deepEqual([...randomEngine.turnOrder].sort(), ['p1', 'p2', 'p3', 'p4']);
    if (randomEngine.turnOrder[0] !== 'p1') {
      wasShuffled = true;
    }
  }
  assert.equal(wasShuffled, true, 'Turn order must be randomized across multiple runs');
});
