import test from 'node:test';
import assert from 'node:assert/strict';
import { CatanEngine, GAME_PHASES } from '../src/game/engine.js';
import { calculateLongestRoad, updateLongestRoadAward } from '../src/game/scoring.js';
import { distributeProduction, createInitialBank } from '../src/game/resources.js';
import { createStandardBoard } from '../src/game/board.js';

test('Full Catan Engine Setup Phase Progression', async (t) => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' }
  ];

  const engine = new CatanEngine(players);
  assert.equal(engine.phase, GAME_PHASES.SETUP_ROUND_1);
  assert.equal(engine.getCurrentPlayer().id, 'p1');

  // ROUND 1: Alice places settlement (v_0) and road (e_0)
  const v0 = engine.board.vertices['v_0'];
  const e0 = engine.board.edges[v0.adjacentEdgeIds[0]];

  assert.equal(engine.setupBuildSettlement('p1', 'v_0').success, true);
  assert.equal(engine.setupBuildRoad('p1', e0.id).success, true);

  // Turn advances to Bob (p2)
  assert.equal(engine.getCurrentPlayer().id, 'p2');

  // Bob cannot violate distance rule (v_0 adjacent vertices cannot be built on)
  const adjVId = v0.adjacentVertexIds[0];
  const failDist = engine.setupBuildSettlement('p2', adjVId);
  assert.equal(failDist.success, false);
  assert.match(failDist.error, /quy tắc khoảng cách/);

  // Bob chooses a far vertex (v_30)
  const v30 = engine.board.vertices['v_30'];
  const e30 = engine.board.edges[v30.adjacentEdgeIds[0]];
  assert.equal(engine.setupBuildSettlement('p2', 'v_30').success, true);
  assert.equal(engine.setupBuildRoad('p2', e30.id).success, true);

  // Turn advances to Charlie (p3)
  assert.equal(engine.getCurrentPlayer().id, 'p3');
  const v45 = engine.board.vertices['v_45'];
  const e45 = engine.board.edges[v45.adjacentEdgeIds[0]];
  assert.equal(engine.setupBuildSettlement('p3', 'v_45').success, true);
  assert.equal(engine.setupBuildRoad('p3', e45.id).success, true);

  // SETUP_ROUND_1 finishes -> transitions to SETUP_ROUND_2 in reverse order!
  assert.equal(engine.phase, GAME_PHASES.SETUP_ROUND_2);
  assert.equal(engine.getCurrentPlayer().id, 'p3', 'Charlie goes first in Round 2');

  // Charlie places 2nd settlement at v_10
  const v10 = engine.board.vertices['v_10'];
  const e10 = engine.board.edges[v10.adjacentEdgeIds[0]];
  assert.equal(engine.setupBuildSettlement('p3', 'v_10').success, true);
  assert.equal(engine.setupBuildRoad('p3', e10.id).success, true);

  // Charlie should receive starting resources from hexes adjacent to v_10
  const charlieTotalRes = Object.values(engine.players['p3'].resources).reduce((a, b) => a + b, 0);
  assert.ok(charlieTotalRes > 0, 'Must receive starting resources from 2nd settlement');

  // Reverse order: Bob (p2)
  assert.equal(engine.getCurrentPlayer().id, 'p2');
  const v15 = engine.board.vertices['v_15'];
  const e15 = engine.board.edges[v15.adjacentEdgeIds[0]];
  assert.equal(engine.setupBuildSettlement('p2', 'v_15').success, true);
  assert.equal(engine.setupBuildRoad('p2', e15.id).success, true);

  // Reverse order: Alice (p1)
  assert.equal(engine.getCurrentPlayer().id, 'p1');
  const v20 = engine.board.vertices['v_20'];
  const e20 = engine.board.edges[v20.adjacentEdgeIds[0]];
  assert.equal(engine.setupBuildSettlement('p1', 'v_20').success, true);
  assert.equal(engine.setupBuildRoad('p1', e20.id).success, true);

  // Setup is complete! Transitions to normal gameplay TURN_ROLL with Alice (p1)
  assert.equal(engine.phase, GAME_PHASES.TURN_ROLL);
  assert.equal(engine.getCurrentPlayer().id, 'p1');
  assert.equal(engine.turnNumber, 1);
});

test('Longest Road Calculation & Cutting Road with Opponent Settlement', async (t) => {
  const board = createStandardBoard();
  const playerId = 'p_alice';
  const opponentId = 'p_bob';

  // Giả sử có một chuỗi đường thẳng gồm 5 cạnh liên tiếp:
  // e0 (v0 - v1), e1 (v1 - v2), e2 (v2 - v3), e3 (v3 - v4), e4 (v4 - v5)
  // Hãy nối một chuỗi 5 cạnh trên đồ thị thật của board
  let currentVId = 'v_0';
  const roadEdges = [];
  const visitedV = new Set([currentVId]);

  for (let i = 0; i < 5; i++) {
    const vertex = board.vertices[currentVId];
    // Tìm cạnh kề chưa đi qua
    let nextEdge = null;
    let nextVId = null;
    for (const eId of vertex.adjacentEdgeIds) {
      const edge = board.edges[eId];
      const otherV = edge.vertexIds[0] === currentVId ? edge.vertexIds[1] : edge.vertexIds[0];
      if (!visitedV.has(otherV)) {
        nextEdge = edge;
        nextVId = otherV;
        break;
      }
    }
    assert.ok(nextEdge, `Must find road segment ${i}`);
    nextEdge.road = { playerId };
    roadEdges.push(nextEdge);
    visitedV.add(nextVId);
    currentVId = nextVId;
  }

  // Alice có 5 cạnh liên tục
  let len = calculateLongestRoad(board, playerId);
  assert.equal(len, 5, 'Alice must have longest road length of 5');

  // Giờ Bob xây một Settlement tại đỉnh giữa (đỉnh thứ 3 trong chuỗi)
  const middleEdge = roadEdges[2];
  const cutVertexId = middleEdge.vertexIds[0];
  board.vertices[cutVertexId].building = { playerId: opponentId, type: 'settlement' };

  // Đoạn đường của Alice bị Bob cắt đôi!
  len = calculateLongestRoad(board, playerId);
  assert.ok(len < 5, `Road must be split and length drop below 5 (was ${len})`);
});

test('Finite Bank Resource Exhaustion Official Catan Rule', () => {
  const board = createStandardBoard();
  const bank = createInitialBank();
  bank.wheat = 1; // Ngân hàng chỉ còn đúng 1 Lúa mì

  // Tìm 1 ô có số 4 sản xuất Lúa mì (fields)
  const hexWheat4 = Object.values(board.hexes).find(h => h.diceNumber === 4 && h.resource === 'wheat');
  assert.ok(hexWheat4);

  // Đặt 2 settlement của 2 người chơi khác nhau tại 2 đỉnh của ô này (tổng cộng cần 2 Lúa mì)
  const v1 = board.vertices[hexWheat4.vertexIds[0]];
  const v2 = board.vertices[hexWheat4.vertexIds[2]];
  v1.building = { playerId: 'p1', type: 'settlement' };
  v2.building = { playerId: 'p2', type: 'settlement' };

  const players = {
    p1: { resources: { wheat: 0 } },
    p2: { resources: { wheat: 0 } }
  };

  // Gieo vào số 4: Ngân hàng chỉ có 1 mà cả 2 người cùng được hưởng (cần 2)
  const { distributions, depletedResources } = distributeProduction(board, 4, players, bank);

  assert.ok(depletedResources.includes('wheat'), 'Wheat must be marked as depleted');
  assert.equal(players.p1.resources.wheat, 0, 'p1 receives 0 wheat due to bank exhaustion rule');
  assert.equal(players.p2.resources.wheat, 0, 'p2 receives 0 wheat due to bank exhaustion rule');
  assert.equal(bank.wheat, 1, 'Bank wheat remains unchanged');
});

test('7-Roll Discard Rounding Rule', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_MAIN;

  // Alice có 7 thẻ -> Không phải bỏ
  engine.players.p1.resources = { wood: 7, clay: 0, sheep: 0, wheat: 0, ore: 0 };
  // Bob có 8 thẻ -> Phải bỏ 4 thẻ (Math.floor(8/2))
  engine.players.p2.resources = { wood: 4, clay: 4, sheep: 0, wheat: 0, ore: 0 };
  // Charlie có 9 thẻ -> Phải bỏ 4 thẻ (Math.floor(9/2))
  engine.players.p3.resources = { wood: 3, clay: 3, sheep: 3, wheat: 0, ore: 0 };

  engine.endTurn('p1'); // Chuyển lượt sang Bob
  assert.equal(engine.phase, GAME_PHASES.TURN_ROLL);

  // Ép gieo xúc xắc ra 7 để kiểm tra logic
  const originalRandom = Math.random;
  try {
    // Math.floor(random * 6) + 1: khi random = 0.5 -> floor(3)+1 = 4, random = 0.4 -> floor(2.4)+1 = 3 -> 4 + 3 = 7
    let callCount = 0;
    Math.random = () => {
      callCount++;
      return (callCount % 2 === 1) ? 0.55 : 0.35; // 4 và 3
    };

    const rollRes = engine.rollDice('p2');
    assert.equal(rollRes.isSeven, true);
    assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_DISCARD);

    assert.equal(engine.pendingDiscards['p1'], undefined, 'Alice has 7 cards, must NOT discard');
    assert.equal(engine.pendingDiscards['p2'], 4, 'Bob has 8 cards, must discard 4');
    assert.equal(engine.pendingDiscards['p3'], 4, 'Charlie has 9 cards, must discard 4');

    // Bob bỏ 4 thẻ hợp lệ
    const bobDiscard = engine.discardResources('p2', { wood: 2, clay: 2, sheep: 0, wheat: 0, ore: 0 });
    assert.equal(bobDiscard.success, true);
    assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_DISCARD, 'Still waiting for Charlie');

    // Charlie bỏ 4 thẻ hợp lệ
    const charlieDiscard = engine.discardResources('p3', { wood: 2, clay: 1, sheep: 1, wheat: 0, ore: 0 });
    assert.equal(charlieDiscard.success, true);

    // Cả hai đã bỏ xong -> Chuyển sang TURN_ROBBER_MOVE
    assert.equal(engine.phase, GAME_PHASES.TURN_ROBBER_MOVE);
  } finally {
    Math.random = originalRandom;
  }
});

test('Development Cards: Purchase and Turn-Played Restrictions', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' }
  ];
  const engine = new CatanEngine(players);
  engine.phase = GAME_PHASES.TURN_MAIN;

  // Cấp tài nguyên cho Alice để mua thẻ
  engine.players.p1.resources = { wood: 0, clay: 0, sheep: 1, wheat: 1, ore: 1 };
  const buyRes = engine.buyDevCardAction('p1');
  assert.equal(buyRes.success, true);
  assert.equal(engine.players.p1.devCards.length, 1);

  // Cố đánh thẻ vừa mua trong cùng lượt -> Bị từ chối theo luật Catan chính thức!
  const card = engine.players.p1.devCards[0];
  if (card.type === 'knight') {
    const playRes = engine.playKnight('p1');
    assert.equal(playRes.success, false);
    assert.match(playRes.error, /vừa mua trong cùng lượt/);
  }
});
