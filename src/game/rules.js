/**
 * PURE GAME ENGINE - RULES & PLACEMENT VALIDATIONS
 */

import { BUILDING_COSTS, canAfford } from './resources.js';

export const PIECE_LIMITS = {
  roads: 15,
  settlements: 5,
  cities: 4
};

/**
 * Thẩm định tính hợp lệ khi xây Khu định cư (Settlement)
 */
export function validateSettlementPlacement(board, vertexId, playerId, { isSetupPhase = false } = {}) {
  const vertex = board.vertices[vertexId];
  if (!vertex) {
    return { valid: false, error: 'Đỉnh không tồn tại trên bàn cờ.' };
  }

  // 1. Đỉnh phải chưa có công trình nào
  if (vertex.building !== null) {
    return { valid: false, error: 'Đỉnh này đã có công trình.' };
  }

  // 2. Quy tắc khoảng cách (Distance Rule):
  // Không được có bất kỳ công trình nào tại các đỉnh kề trực tiếp (khoảng cách tối thiểu 2 cạnh)
  for (const neighborVId of vertex.adjacentVertexIds) {
    const neighborVertex = board.vertices[neighborVId];
    if (neighborVertex && neighborVertex.building !== null) {
      return { valid: false, error: 'Vi phạm quy tắc khoảng cách: Quá gần một công trình khác (phải cách ít nhất 2 cạnh).' };
    }
  }

  // 3. Quy tắc kết nối đường mạng (Network Connectivity)
  if (!isSetupPhase) {
    // Trong lượt thông thường, khu định cư mới bắt buộc phải nối vào ít nhất 1 con đường của chính người chơi
    const hasConnectingRoad = vertex.adjacentEdgeIds.some(edgeId => {
      const edge = board.edges[edgeId];
      return edge && edge.road && edge.road.playerId === playerId;
    });

    if (!hasConnectingRoad) {
      return { valid: false, error: 'Khu định cư mới phải nối liền với ít nhất một con đường của bạn.' };
    }
  }

  return { valid: true };
}

/**
 * Thẩm định tính hợp lệ khi nâng cấp Thành phố (City)
 */
export function validateCityPlacement(board, vertexId, playerId) {
  const vertex = board.vertices[vertexId];
  if (!vertex) {
    return { valid: false, error: 'Đỉnh không tồn tại trên bàn cờ.' };
  }

  // Phải nâng cấp từ một khu định cư của chính người chơi
  if (!vertex.building) {
    return { valid: false, error: 'Chỉ có thể nâng cấp Thành phố từ một Khu định cư hiện có.' };
  }

  if (vertex.building.playerId !== playerId) {
    return { valid: false, error: 'Bạn không thể nâng cấp công trình của đối thủ.' };
  }

  if (vertex.building.type !== 'settlement') {
    return { valid: false, error: 'Công trình tại đỉnh này đã là Thành phố rồi.' };
  }

  return { valid: true };
}

/**
 * Thẩm định tính hợp lệ khi xây Đường (Road)
 */
export function validateRoadPlacement(board, edgeId, playerId, { isSetupPhase = false, setupSettlementVertexId = null } = {}) {
  const edge = board.edges[edgeId];
  if (!edge) {
    return { valid: false, error: 'Cạnh không tồn tại trên bàn cờ.' };
  }

  // 1. Cạnh phải chưa có đường
  if (edge.road !== null) {
    return { valid: false, error: 'Cạnh này đã có người xây đường.' };
  }

  // 2. Trong giai đoạn khởi đầu (Setup Phase)
  if (isSetupPhase) {
    if (!setupSettlementVertexId) {
      return { valid: false, error: 'Không xác định được khu định cư vừa đặt trong giai đoạn khởi đầu.' };
    }
    // Đường khởi đầu bắt buộc phải gắn trực tiếp vào khu định cư vừa đặt
    if (!edge.vertexIds.includes(setupSettlementVertexId)) {
      return { valid: false, error: 'Đường khởi đầu phải nối trực tiếp vào Khu định cư vừa xây.' };
    }
    return { valid: true };
  }

  // 3. Trong lượt chơi thông thường (Main Phase)
  // Đường phải nối vào:
  // a) Công trình của chính người chơi tại một trong 2 đầu đỉnh
  // b) Hoặc một con đường khác của người chơi tại một trong 2 đầu đỉnh,
  //    NHƯNG đỉnh đó KHÔNG ĐƯỢC CÓ CÔNG TRÌNH CỦA ĐỐI THỦ (công trình đối thủ chặn dòng đường).
  let isConnected = false;

  for (const vId of edge.vertexIds) {
    const vertex = board.vertices[vId];
    if (!vertex) continue;

    // Trường hợp a: Đỉnh có công trình của chính mình
    if (vertex.building && vertex.building.playerId === playerId) {
      isConnected = true;
      break;
    }

    // Trường hợp đối thủ có công trình ở đỉnh này -> Bị chặn, không thể nối qua
    if (vertex.building && vertex.building.playerId !== playerId) {
      continue;
    }

    // Trường hợp b: Đỉnh không có công trình đối thủ, kiểm tra các cạnh kề đỉnh đó có đường của mình không
    const hasAdjacentRoad = vertex.adjacentEdgeIds.some(adjEdgeId => {
      if (adjEdgeId === edgeId) return false;
      const adjEdge = board.edges[adjEdgeId];
      return adjEdge && adjEdge.road && adjEdge.road.playerId === playerId;
    });

    if (hasAdjacentRoad) {
      isConnected = true;
      break;
    }
  }

  if (!isConnected) {
    return { valid: false, error: 'Đường mới phải nối liền với mạng lưới đường hoặc công trình hiện có của bạn.' };
  }

  return { valid: true };
}

/**
 * Tính toán tỷ lệ giao dịch tốt nhất (Trade Ratios) của người chơi với Ngân hàng/Cảng
 */
export function getPlayerTradeRatios(board, playerId) {
  // Mặc định tỷ lệ ngân hàng cơ bản là 4:1 cho tất cả 5 loại
  const ratios = {
    wood: 4,
    clay: 4,
    sheep: 4,
    wheat: 4,
    ore: 4
  };

  // Quét các đỉnh có công trình thuộc sở hữu của người chơi
  Object.values(board.vertices).forEach(vertex => {
    if (vertex.building && vertex.building.playerId === playerId && vertex.port) {
      const port = vertex.port;
      if (port.type === 'generic') {
        // Cảng 3:1 tổng quát áp dụng cho mọi tài nguyên có tỷ lệ > 3
        Object.keys(ratios).forEach(res => {
          ratios[res] = Math.min(ratios[res], 3);
        });
      } else if (port.resource && ratios[port.resource] > 2) {
        // Cảng chuyên biệt 2:1 cho đúng loại tài nguyên đó
        ratios[port.resource] = 2;
      }
    }
  });

  return ratios;
}

/**
 * Thẩm định giao dịch với Ngân hàng / Cảng (Maritime Trade)
 */
export function validateBankTrade(board, playerId, playerResources, bank, giveResource, getResource) {
  if (!giveResource || !getResource) {
    return { valid: false, error: 'Vui lòng chọn tài nguyên đưa ra và nhận về.' };
  }

  if (giveResource === getResource) {
    return { valid: false, error: 'Không thể đổi lấy cùng một loại tài nguyên.' };
  }

  if (bank[getResource] <= 0) {
    return { valid: false, error: `Ngân hàng đã hết tài nguyên ${getResource}.` };
  }

  const ratios = getPlayerTradeRatios(board, playerId);
  const requiredAmount = ratios[giveResource];

  if ((playerResources[giveResource] || 0) < requiredAmount) {
    return { valid: false, error: `Bạn cần ${requiredAmount} ${giveResource} để đổi 1 ${getResource}.` };
  }

  return { valid: true, cost: requiredAmount };
}
