import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBaseTopology,
  createStandardBoard,
  createRandomBoard,
  create56StandardBoard,
  create56RandomBoard,
  validateRedNumbersNotAdjacent,
  getProductiveHexes,
  areHexesAdjacent
} from '../src/game/board.js';

test('Board Topology and Geometry Verification', async (t) => {
  const board = buildBaseTopology();

  await t.test('Geometry counts match Catan Classic standard specifications', () => {
    const hexCount = Object.keys(board.hexes).length;
    const vertexCount = Object.keys(board.vertices).length;
    const edgeCount = Object.keys(board.edges).length;
    const portCount = board.ports.length;

    assert.equal(hexCount, 19, 'Must have exactly 19 hex tiles');
    assert.equal(vertexCount, 54, 'Must have exactly 54 vertices');
    assert.equal(edgeCount, 72, 'Must have exactly 72 edges');
    assert.equal(portCount, 9, 'Must have exactly 9 ports');

    // Euler characteristic for planar graph: V - E + F = 1 (outer face excluded)
    assert.equal(vertexCount - edgeCount + hexCount, 1, 'Euler formula V - E + F = 1 must hold');
  });

  await t.test('Vertex and Edge relationships are mutually consistent', () => {
    Object.values(board.edges).forEach(edge => {
      const [vAId, vBId] = edge.vertexIds;
      const vA = board.vertices[vAId];
      const vB = board.vertices[vBId];

      assert.ok(vA, `Vertex ${vAId} must exist`);
      assert.ok(vB, `Vertex ${vBId} must exist`);
      assert.ok(vA.adjacentEdgeIds.includes(edge.id), `Vertex ${vAId} must reference Edge ${edge.id}`);
      assert.ok(vB.adjacentEdgeIds.includes(edge.id), `Vertex ${vBId} must reference Edge ${edge.id}`);
      assert.ok(vA.adjacentVertexIds.includes(vBId), `Vertex ${vAId} must have ${vBId} as adjacent`);
      assert.ok(vB.adjacentVertexIds.includes(vAId), `Vertex ${vBId} must have ${vAId} as adjacent`);
    });

    Object.values(board.hexes).forEach(hex => {
      assert.equal(hex.vertexIds.length, 6, `Hex ${hex.id} must have exactly 6 vertices`);
      assert.equal(hex.edgeIds.length, 6, `Hex ${hex.id} must have exactly 6 edges`);
      hex.vertexIds.forEach(vId => {
        assert.ok(board.vertices[vId].adjacentHexIds.includes(hex.id));
      });
      hex.edgeIds.forEach(eId => {
        assert.ok(board.edges[eId].adjacentHexIds.includes(hex.id));
      });
    });
  });

  await t.test('Ports are properly attached to 2 distinct coastal vertices', () => {
    board.ports.forEach(port => {
      assert.equal(port.vertexIds.length, 2, 'Port must have 2 vertices');
      const [v1Id, v2Id] = port.vertexIds;
      const v1 = board.vertices[v1Id];
      const v2 = board.vertices[v2Id];

      assert.ok(v1.port, `Vertex ${v1Id} must have port attached`);
      assert.ok(v2.port, `Vertex ${v2Id} must have port attached`);
      assert.equal(v1.port.type, port.type);
      assert.equal(v2.port.type, port.type);
    });
  });
});

test('Standard Beginner Board Rules Compliance', async (t) => {
  const standardBoard = createStandardBoard();

  await t.test('Correct distribution of terrain tiles', () => {
    const terrainCounts = {};
    Object.values(standardBoard.hexes).forEach(hex => {
      terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] || 0) + 1;
    });

    assert.equal(terrainCounts['forest'], 4, '4 Forest hexes');
    assert.equal(terrainCounts['hills'], 3, '3 Hills hexes');
    assert.equal(terrainCounts['pasture'], 4, '4 Pasture hexes');
    assert.equal(terrainCounts['fields'], 4, '4 Fields hexes');
    assert.equal(terrainCounts['mountains'], 3, '3 Mountains hexes');
    assert.equal(terrainCounts['desert'], 1, '1 Desert hex');
  });

  await t.test('Red numbers 6 and 8 are never adjacent', () => {
    const isValid = validateRedNumbersNotAdjacent(standardBoard);
    assert.equal(isValid, true, 'Beginner map must have no adjacent 6 and 8');
  });

  await t.test('Robber starts on Desert tile', () => {
    const desertHex = Object.values(standardBoard.hexes).find(h => h.terrain === 'desert');
    assert.ok(desertHex);
    assert.equal(desertHex.hasRobber, true);
    assert.equal(desertHex.diceNumber, null);
    assert.equal(standardBoard.robberHexId, desertHex.id);
  });
});

test('Random Board Generator Rules Compliance', async (t) => {
  for (let trial = 0; trial < 10; trial++) {
    const randomBoard = createRandomBoard();

    // Kiểm tra không có 6 và 8 kề nhau
    assert.equal(
      validateRedNumbersNotAdjacent(randomBoard),
      true,
      `Trial ${trial}: Red numbers 6 and 8 must never be adjacent in random board`
    );

    // Kiểm tra đủ 19 ô
    const terrainCounts = {};
    Object.values(randomBoard.hexes).forEach(hex => {
      terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] || 0) + 1;
    });
    assert.equal(terrainCounts['forest'], 4);
    assert.equal(terrainCounts['hills'], 3);
    assert.equal(terrainCounts['pasture'], 4);
    assert.equal(terrainCounts['fields'], 4);
    assert.equal(terrainCounts['mountains'], 3);
    assert.equal(terrainCounts['desert'], 1);
  }
});

test('Productive Hexes and Robber Blocking', () => {
  const board = createStandardBoard();

  // Tìm tất cả hex có số 8
  const hexesWith8 = Object.values(board.hexes).filter(h => h.diceNumber === 8);
  assert.equal(hexesWith8.length, 2, 'There are two number 8 hexes');

  // Khi chưa chặn bởi tên cướp
  let productive8 = getProductiveHexes(board, 8);
  assert.equal(productive8.length, 2);

  // Di chuyển tên cướp chặn 1 trong 2 ô có số 8
  const targetHex = hexesWith8[0];
  targetHex.hasRobber = true;
  board.robberHexId = targetHex.id;

  productive8 = getProductiveHexes(board, 8);
  assert.equal(productive8.length, 1, 'Hex with robber must NOT produce resources');
  assert.equal(productive8[0].id, hexesWith8[1].id);
});

test('5-6 Player Board Extension Compliance', async (t) => {
  const board56 = create56StandardBoard();

  await t.test('Geometry counts match 5-6 Player Extension specifications', () => {
    const hexCount = Object.keys(board56.hexes).length;
    const vertexCount = Object.keys(board56.vertices).length;
    const edgeCount = Object.keys(board56.edges).length;
    const portCount = board56.ports.length;

    assert.equal(hexCount, 30, 'Must have exactly 30 hex tiles');
    assert.equal(vertexCount, 80, 'Must have exactly 80 vertices');
    assert.equal(edgeCount, 109, 'Must have exactly 109 edges');
    assert.equal(portCount, 11, 'Must have exactly 11 ports');
    assert.equal(board56.is56, true, 'is56 flag must be true');
  });

  await t.test('Correct distribution of terrain tiles in 5-6 extension', () => {
    const terrainCounts = {};
    Object.values(board56.hexes).forEach(hex => {
      terrainCounts[hex.terrain] = (terrainCounts[hex.terrain] || 0) + 1;
    });

    assert.equal(terrainCounts['forest'], 6, '6 Forest hexes');
    assert.equal(terrainCounts['pasture'], 6, '6 Pasture hexes');
    assert.equal(terrainCounts['fields'], 6, '6 Fields hexes');
    assert.equal(terrainCounts['hills'], 5, '5 Hills hexes');
    assert.equal(terrainCounts['mountains'], 5, '5 Mountains hexes');
    assert.equal(terrainCounts['desert'], 2, '2 Desert hexes');
  });

  await t.test('Red numbers 6 and 8 are never adjacent on 5-6 standard board', () => {
    const isValid = validateRedNumbersNotAdjacent(board56);
    assert.equal(isValid, true, '5-6 map must have no adjacent 6 and 8');
  });

  await t.test('Random 5-6 board generator produces valid 30-hex board', () => {
    for (let i = 0; i < 5; i++) {
      const random56 = create56RandomBoard();
      assert.equal(Object.keys(random56.hexes).length, 30);
      assert.equal(random56.ports.length, 11);
      assert.equal(validateRedNumbersNotAdjacent(random56), true);
    }
  });
});

