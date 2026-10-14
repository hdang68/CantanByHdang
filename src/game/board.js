/**
 * PURE GAME ENGINE - BOARD TOPOLOGY & GENERATION
 * Mô hình dữ liệu bản đồ Catan Classic độc lập 100% với DOM, CSS, SVG và Socket.IO.
 */

export const TERRAINS = {
  FOREST: { id: 'forest', name: 'Rừng', resource: 'wood', defaultCount: 4, color: '#2d6a4f' },
  HILLS: { id: 'hills', name: 'Đồi', resource: 'clay', defaultCount: 3, color: '#b7410e' },
  PASTURE: { id: 'pasture', name: 'Đồng cỏ', resource: 'sheep', defaultCount: 4, color: '#74c69d' },
  FIELDS: { id: 'fields', name: 'Đồng bằng', resource: 'wheat', defaultCount: 4, color: '#f3c623' },
  MOUNTAINS: { id: 'mountains', name: 'Núi', resource: 'ore', defaultCount: 3, color: '#6c757d' },
  DESERT: { id: 'desert', name: 'Sa mạc', resource: null, defaultCount: 1, color: '#e9d8a6' }
};

export const STANDARD_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const NUMBER_PIPS = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1
};

export const PORT_TYPES = {
  GENERIC: { id: 'generic', name: 'Cảng 3:1', resource: null, ratio: 3 },
  WOOD: { id: 'wood', name: 'Cảng Gỗ 2:1', resource: 'wood', ratio: 2 },
  CLAY: { id: 'clay', name: 'Cảng Đất sét 2:1', resource: 'clay', ratio: 2 },
  SHEEP: { id: 'sheep', name: 'Cảng Cừu 2:1', resource: 'sheep', ratio: 2 },
  WHEAT: { id: 'wheat', name: 'Cảng Lúa mì 2:1', resource: 'wheat', ratio: 2 },
  ORE: { id: 'ore', name: 'Cảng Quặng 2:1', resource: 'ore', ratio: 2 }
};

// 19 Tọa độ Axial cố định cho cấu hình lục giác bán kính 2
export const HEX_AXIAL_COORDS = [
  // Hàng r = -2 (3 hex)
  { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // Hàng r = -1 (4 hex)
  { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // Hàng r = 0 (5 hex - đi qua tâm)
  { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // Hàng r = 1 (4 hex)
  { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // Hàng r = 2 (3 hex)
  { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }
];

// Cấu hình bản đồ tiêu chuẩn người mới (Official Beginner Layout)
export const STANDARD_BEGINNER_SETUP = [
  { terrain: 'mountains', number: 10 },
  { terrain: 'pasture',   number: 2 },
  { terrain: 'forest',    number: 9 },
  { terrain: 'fields',    number: 12 },
  { terrain: 'hills',     number: 6 },
  { terrain: 'pasture',   number: 4 },
  { terrain: 'hills',     number: 10 },
  { terrain: 'fields',    number: 9 },
  { terrain: 'forest',    number: 11 },
  { terrain: 'desert',    number: null },
  { terrain: 'forest',    number: 3 },
  { terrain: 'mountains', number: 8 },
  { terrain: 'forest',    number: 8 },
  { terrain: 'mountains', number: 3 },
  { terrain: 'fields',    number: 4 },
  { terrain: 'pasture',   number: 5 },
  { terrain: 'hills',     number: 5 },
  { terrain: 'fields',    number: 6 },
  { terrain: 'pasture',   number: 11 }
];

/**
 * Sinh cấu trúc topo đồ thị bất biến (Base Topological Graph)
 * Gồm 19 hexes, 54 vertices, 72 edges và 9 cảng.
 */
export function buildBaseTopology(R = 100) {
  const hexes = {};
  const vertices = {};
  const edges = {};

  const vertexKeyMap = new Map();
  const edgeKeyMap = new Map();

  let vCounter = 0;
  let eCounter = 0;

  // Bước 1: Khởi tạo 19 Hexes và xác định các đỉnh, cạnh
  HEX_AXIAL_COORDS.forEach((coord, hexIndex) => {
    const hexId = `hex_${hexIndex}`;
    const cx = R * Math.sqrt(3) * (coord.q + coord.r / 2);
    const cy = R * 1.5 * coord.r;

    const hexVertexIds = [];
    const hexEdgeIds = [];

    // Tính 6 đỉnh của lục giác (pointy-topped)
    const currentHexVertices = [];
    for (let i = 0; i < 6; i++) {
      const angleRad = (Math.PI / 180) * (30 + i * 60);
      const vx = Math.round((cx + R * Math.cos(angleRad)) * 100) / 100;
      const vy = Math.round((cy + R * Math.sin(angleRad)) * 100) / 100;
      const vKey = `${vx},${vy}`;

      if (!vertexKeyMap.has(vKey)) {
        const vId = `v_${vCounter++}`;
        const newVertex = {
          id: vId,
          x: vx,
          y: vy,
          adjacentHexIds: [],
          adjacentVertexIds: [],
          adjacentEdgeIds: [],
          building: null,
          port: null
        };
        vertexKeyMap.set(vKey, newVertex);
        vertices[vId] = newVertex;
      }

      const vertexObj = vertexKeyMap.get(vKey);
      if (!vertexObj.adjacentHexIds.includes(hexId)) {
        vertexObj.adjacentHexIds.push(hexId);
      }
      hexVertexIds.push(vertexObj.id);
      currentHexVertices.push(vertexObj);
    }

    // Tính 6 cạnh của lục giác nối giữa các cặp đỉnh kề nhau
    for (let i = 0; i < 6; i++) {
      const vA = currentHexVertices[i];
      const vB = currentHexVertices[(i + 1) % 6];
      const eKey = [vA.id, vB.id].sort().join('--');

      if (!edgeKeyMap.has(eKey)) {
        const eId = `e_${eCounter++}`;
        const sortedVertices = [vA.id, vB.id].sort();
        const newEdge = {
          id: eId,
          vertexIds: sortedVertices,
          adjacentHexIds: [],
          road: null
        };
        edgeKeyMap.set(eKey, newEdge);
        edges[eId] = newEdge;

        // Cập nhật quan hệ hai chiều đỉnh - cạnh
        vA.adjacentEdgeIds.push(eId);
        vB.adjacentEdgeIds.push(eId);

        // Cập nhật quan hệ hai chiều đỉnh - đỉnh kề
        if (!vA.adjacentVertexIds.includes(vB.id)) vA.adjacentVertexIds.push(vB.id);
        if (!vB.adjacentVertexIds.includes(vA.id)) vB.adjacentVertexIds.push(vA.id);
      }

      const edgeObj = edgeKeyMap.get(eKey);
      if (!edgeObj.adjacentHexIds.includes(hexId)) {
        edgeObj.adjacentHexIds.push(hexId);
      }
      hexEdgeIds.push(edgeObj.id);
    }

    hexes[hexId] = {
      id: hexId,
      coord,
      center: { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100 },
      terrain: null,
      resource: null,
      diceNumber: null,
      hasRobber: false,
      vertexIds: hexVertexIds,
      edgeIds: hexEdgeIds,
      neighborHexIds: []
    };
  });

  // Bước 2: Xác định các hex láng giềng kề nhau (chung cạnh)
  Object.values(hexes).forEach(hexA => {
    Object.values(hexes).forEach(hexB => {
      if (hexA.id !== hexB.id) {
        const sharedEdges = hexA.edgeIds.filter(eId => hexB.edgeIds.includes(eId));
        if (sharedEdges.length > 0 && !hexA.neighborHexIds.includes(hexB.id)) {
          hexA.neighborHexIds.push(hexB.id);
        }
      }
    });
  });

  // Bước 3: Xác định 9 cảng tiêu chuẩn trên các cạnh vành đai ngoài
  // Lọc các cạnh ven biển (chỉ tiếp giáp đúng 1 hex)
  const coastalEdges = Object.values(edges).filter(e => e.adjacentHexIds.length === 1);

  // Sắp xếp các cạnh ven biển theo góc xoay quanh tâm (0,0) theo chiều kim đồng hồ
  coastalEdges.sort((ea, eb) => {
    const vA1 = vertices[ea.vertexIds[0]];
    const vA2 = vertices[ea.vertexIds[1]];
    const angleA = Math.atan2((vA1.y + vA2.y) / 2, (vA1.x + vA2.x) / 2);

    const vB1 = vertices[eb.vertexIds[0]];
    const vB2 = vertices[eb.vertexIds[1]];
    const angleB = Math.atan2((vB1.y + vB2.y) / 2, (vB1.x + vB2.x) / 2);

    return angleA - angleB;
  });

  // Có chính xác 30 cạnh ven biển. Chọn 9 vị trí cảng cách đều và hợp lệ
  // Các chỉ số tương ứng theo vòng tròn:
  const portIndices = [0, 3, 7, 10, 14, 17, 21, 24, 27];
  const standardPortTypes = [
    PORT_TYPES.GENERIC, // 3:1
    PORT_TYPES.WHEAT,   // 2:1 Lúa mì
    PORT_TYPES.ORE,     // 2:1 Quặng
    PORT_TYPES.GENERIC, // 3:1
    PORT_TYPES.SHEEP,   // 2:1 Cừu
    PORT_TYPES.GENERIC, // 3:1
    PORT_TYPES.CLAY,    // 2:1 Đất sét
    PORT_TYPES.WOOD,    // 2:1 Gỗ
    PORT_TYPES.GENERIC  // 3:1
  ];

  const ports = [];
  portIndices.forEach((edgeIdx, idx) => {
    const edge = coastalEdges[edgeIdx % coastalEdges.length];
    const portDef = standardPortTypes[idx];
    const portId = `port_${idx}`;

    const portObj = {
      id: portId,
      type: portDef.id,
      resource: portDef.resource,
      ratio: portDef.ratio,
      name: portDef.name,
      edgeId: edge.id,
      vertexIds: [...edge.vertexIds]
    };

    ports.push(portObj);

    // Gán thông tin cảng vào 2 đỉnh tương ứng
    edge.vertexIds.forEach(vId => {
      vertices[vId].port = {
        type: portDef.id,
        resource: portDef.resource,
        ratio: portDef.ratio,
        portId
      };
    });
  });

  return { hexes, vertices, edges, ports };
}

/**
 * Kiểm tra xem 2 ô lục giác có đang kề nhau (chung 1 cạnh) hay không
 */
export function areHexesAdjacent(board, hexId1, hexId2) {
  const hex1 = board.hexes[hexId1];
  if (!hex1) return false;
  return hex1.neighborHexIds.includes(hexId2);
}

/**
 * Kiểm tra phân bổ số: 6 và 8 KHÔNG ĐƯỢC PHÉP nằm trên 2 ô kề nhau
 */
export function validateRedNumbersNotAdjacent(board) {
  const redHexIds = Object.values(board.hexes)
    .filter(h => h.diceNumber === 6 || h.diceNumber === 8)
    .map(h => h.id);

  for (let i = 0; i < redHexIds.length; i++) {
    for (let j = i + 1; j < redHexIds.length; j++) {
      if (areHexesAdjacent(board, redHexIds[i], redHexIds[j])) {
        return false; // Vi phạm: 6 và 8 kề nhau
      }
    }
  }
  return true;
}

/**
 * Tạo bản đồ tiêu chuẩn cho người mới (Official Beginner Map)
 */
export function createStandardBoard() {
  const board = buildBaseTopology();

  STANDARD_BEGINNER_SETUP.forEach((setup, index) => {
    const hexId = `hex_${index}`;
    const terrainDef = Object.values(TERRAINS).find(t => t.id === setup.terrain);

    board.hexes[hexId].terrain = setup.terrain;
    board.hexes[hexId].resource = terrainDef ? terrainDef.resource : null;
    board.hexes[hexId].diceNumber = setup.number;
    board.hexes[hexId].hasRobber = (setup.terrain === 'desert');
  });

  const desertHex = Object.values(board.hexes).find(h => h.terrain === 'desert');
  board.robberHexId = desertHex ? desertHex.id : 'hex_9';

  return board;
}

/**
 * Trộn mảng ngẫu nhiên (Fisher-Yates Shuffle)
 */
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Tạo bản đồ ngẫu nhiên hợp lệ (Random Valid Board)
 * Tự động kiểm tra để số 6 và 8 không bao giờ kề nhau.
 */
export function createRandomBoard() {
  const board = buildBaseTopology();

  // Tạo mảng 19 địa hình: 4 Gỗ, 3 Đất sét, 4 Cừu, 4 Lúa mì, 3 Quặng, 1 Sa mạc
  const terrainPool = [
    'forest', 'forest', 'forest', 'forest',
    'hills', 'hills', 'hills',
    'pasture', 'pasture', 'pasture', 'pasture',
    'fields', 'fields', 'fields', 'fields',
    'mountains', 'mountains', 'mountains',
    'desert'
  ];

  let isValid = false;
  let attempts = 0;

  while (!isValid && attempts < 500) {
    attempts++;
    const shuffledTerrains = shuffle(terrainPool);
    const shuffledNumbers = shuffle(STANDARD_NUMBERS);

    let numberIdx = 0;
    Object.keys(board.hexes).forEach((hexId, idx) => {
      const terrainId = shuffledTerrains[idx];
      const terrainDef = Object.values(TERRAINS).find(t => t.id === terrainId);

      board.hexes[hexId].terrain = terrainId;
      board.hexes[hexId].resource = terrainDef.resource;

      if (terrainId === 'desert') {
        board.hexes[hexId].diceNumber = null;
        board.hexes[hexId].hasRobber = true;
        board.robberHexId = hexId;
      } else {
        board.hexes[hexId].diceNumber = shuffledNumbers[numberIdx++];
        board.hexes[hexId].hasRobber = false;
      }
    });

    // Thẩm định luật: 6 và 8 không được kề nhau
    if (validateRedNumbersNotAdjacent(board)) {
      isValid = true;
    }
  }

  return board;
}

/**
 * Lấy danh sách ô hex tạo tài nguyên khi xúc xắc gieo vào số `diceRoll`
 * (Không tính ô đang có Tên cướp đứng)
 */
export function getProductiveHexes(board, diceRoll) {
  if (diceRoll === 7) return [];
  return Object.values(board.hexes).filter(
    hex => hex.diceNumber === diceRoll && !hex.hasRobber && hex.resource !== null
  );
}
