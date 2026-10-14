/**
 * PURE GAME ENGINE - LONGEST ROAD (DFS), LARGEST ARMY & VICTORY POINTS
 */

/**
 * Tính độ dài đường đi liên tục dài nhất của người chơi bằng thuật toán DFS Backtracking.
 * Tuân thủ tuyệt đối luật Catan:
 * - Không đi qua cùng 1 cạnh quá 1 lần (Simple trail).
 * - Được phép rẽ nhánh, khép vòng (vòng lặp chỉ tính khi không lặp cạnh).
 * - Công trình của đối thủ trên đỉnh sẽ chặn đứng đường đi qua đỉnh đó.
 */
export function calculateLongestRoad(board, playerId) {
  // Lấy danh sách tất cả các cạnh thuộc sở hữu của người chơi
  const playerEdges = Object.values(board.edges).filter(
    e => e.road && e.road.playerId === playerId
  );

  if (playerEdges.length === 0) return 0;

  // Thu thập tất cả các đỉnh đầu mút liên quan đến các cạnh của người chơi
  const candidateVertices = new Set();
  playerEdges.forEach(e => {
    candidateVertices.add(e.vertexIds[0]);
    candidateVertices.add(e.vertexIds[1]);
  });

  let maxTrailLength = 0;

  // Hàm DFS duyệt đường đi liên tục không lặp cạnh
  function dfs(currentVId, visitedEdgeIds) {
    if (visitedEdgeIds.size > maxTrailLength) {
      maxTrailLength = visitedEdgeIds.size;
    }

    const vertex = board.vertices[currentVId];
    if (!vertex) return;

    // Nếu đỉnh này có công trình của ĐỐI THỦ và chúng ta đã đi qua ít nhất 1 cạnh,
    // thì con đường BỊ CHẶN tại đỉnh này, không thể đi tiếp qua đỉnh này!
    if (visitedEdgeIds.size > 0 && vertex.building && vertex.building.playerId !== playerId) {
      return;
    }

    // Tìm tất cả các cạnh kề đỉnh này thuộc sở hữu của mình mà CHƯA ĐI QUA
    for (const edgeId of vertex.adjacentEdgeIds) {
      if (visitedEdgeIds.has(edgeId)) continue;

      const edge = board.edges[edgeId];
      if (!edge || !edge.road || edge.road.playerId !== playerId) continue;

      // Xác định đỉnh ở đầu kia của cạnh
      const nextVId = (edge.vertexIds[0] === currentVId) ? edge.vertexIds[1] : edge.vertexIds[0];

      // Đánh dấu cạnh đã đi và tiếp tục đệ quy
      visitedEdgeIds.add(edgeId);
      dfs(nextVId, visitedEdgeIds);
      // Quay lui (Backtrack)
      visitedEdgeIds.delete(edgeId);
    }
  }

  // Duyệt DFS xuất phát từ mọi đỉnh tiềm năng
  for (const startVId of candidateVertices) {
    dfs(startVId, new Set());
  }

  return maxTrailLength;
}

/**
 * Cập nhật danh hiệu Longest Road (2 Điểm chiến thắng)
 * Điều kiện tối thiểu: Độ dài >= 5 cạnh
 */
export function updateLongestRoadAward(board, players, currentAward) {
  // Tính độ dài đường của tất cả người chơi
  const lengths = {};
  Object.keys(players).forEach(pId => {
    lengths[pId] = calculateLongestRoad(board, pId);
    players[pId].longestRoadLength = lengths[pId];
  });

  const holderId = currentAward?.playerId || null;
  const currentHolderLength = holderId ? lengths[holderId] : 0;

  // Trường hợp 1: Chưa có ai giữ danh hiệu
  if (!holderId) {
    let bestPlayerId = null;
    let bestLength = 4; // Ngưỡng tối thiểu là 5

    Object.keys(players).forEach(pId => {
      if (lengths[pId] > bestLength) {
        bestLength = lengths[pId];
        bestPlayerId = pId;
      }
    });

    if (bestPlayerId && bestLength >= 5) {
      players[bestPlayerId].hasLongestRoad = true;
      return { playerId: bestPlayerId, length: bestLength };
    }
    return { playerId: null, length: 0 };
  }

  // Trường hợp 2: Đang có người giữ danh hiệu
  // Kiểm tra xem có người chơi nào VƯỢT TRỘI HƠN NGHIÊM NGẶT (> currentHolderLength) không
  let newChallengerId = null;
  let maxOpponentLength = currentHolderLength;

  Object.keys(players).forEach(pId => {
    if (pId !== holderId && lengths[pId] > maxOpponentLength) {
      maxOpponentLength = lengths[pId];
      newChallengerId = pId;
    }
  });

  if (newChallengerId) {
    // Có người vượt hơn điểm người đang giữ -> Chuyển giao danh hiệu
    players[holderId].hasLongestRoad = false;
    players[newChallengerId].hasLongestRoad = true;
    return { playerId: newChallengerId, length: maxOpponentLength };
  }

  // Kiểm tra xem con đường của người đang giữ có bị chặt đứt làm giảm độ dài không
  if (lengths[holderId] < 5) {
    // Người giữ bị tụt dưới 5 cạnh -> Mất danh hiệu
    players[holderId].hasLongestRoad = false;

    // Tìm xem có người khác đạt >= 5 không
    const qualified = Object.keys(players)
      .filter(pId => lengths[pId] >= 5)
      .map(pId => ({ pId, len: lengths[pId] }))
      .sort((a, b) => b.len - a.len);

    if (qualified.length === 0) {
      return { playerId: null, length: 0 };
    }

    // Nếu người đứng đầu cao nhất đơn độc
    if (qualified.length === 1 || qualified[0].len > qualified[1].len) {
      players[qualified[0].pId].hasLongestRoad = true;
      return { playerId: qualified[0].pId, length: qualified[0].len };
    } else {
      // Hòa điểm giữa các đối thủ còn lại -> Bỏ trống danh hiệu theo luật Catan
      return { playerId: null, length: 0 };
    }
  }

  // Giữ nguyên người đang giữ
  players[holderId].hasLongestRoad = true;
  return { playerId: holderId, length: lengths[holderId] };
}

/**
 * Cập nhật danh hiệu Largest Army (2 Điểm chiến thắng)
 * Điều kiện tối thiểu: Số Knight đã đánh >= 3
 */
export function updateLargestArmyAward(players, currentAward) {
  const holderId = currentAward?.playerId || null;
  const currentHolderCount = holderId ? (players[holderId]?.knightsPlayed || 0) : 0;

  if (!holderId) {
    let bestPlayerId = null;
    let bestCount = 2; // Ngưỡng tối thiểu là 3

    Object.keys(players).forEach(pId => {
      const count = players[pId].knightsPlayed || 0;
      if (count > bestCount) {
        bestCount = count;
        bestPlayerId = pId;
      }
    });

    if (bestPlayerId && bestCount >= 3) {
      players[bestPlayerId].hasLargestArmy = true;
      return { playerId: bestPlayerId, count: bestCount };
    }
    return { playerId: null, count: 0 };
  }

  // Đã có người giữ -> Phải nghiêm ngặt lớn hơn mới cướp được danh hiệu
  let challengerId = null;
  let maxCount = currentHolderCount;

  Object.keys(players).forEach(pId => {
    const count = players[pId].knightsPlayed || 0;
    if (pId !== holderId && count > maxCount) {
      maxCount = count;
      challengerId = pId;
    }
  });

  if (challengerId) {
    players[holderId].hasLargestArmy = false;
    players[challengerId].hasLargestArmy = true;
    return { playerId: challengerId, count: maxCount };
  }

  return { playerId: holderId, count: currentHolderCount };
}

/**
 * Tính điểm chiến thắng (Victory Points) cho người chơi
 */
export function calculateVictoryPoints(player, board) {
  let publicPoints = 0;

  // 1. Điểm từ Khu định cư (1 VP) và Thành phố (2 VP)
  Object.values(board.vertices).forEach(vertex => {
    if (vertex.building && vertex.building.playerId === player.id) {
      if (vertex.building.type === 'settlement') publicPoints += 1;
      if (vertex.building.type === 'city') publicPoints += 2;
    }
  });

  // 2. Danh hiệu Longest Road (2 VP)
  if (player.hasLongestRoad) publicPoints += 2;

  // 3. Danh hiệu Largest Army (2 VP)
  if (player.hasLargestArmy) publicPoints += 2;

  // 4. Thẻ phát triển Victory Point bí mật trên tay (1 VP mỗi thẻ)
  let hiddenVP = 0;
  if (player.devCards) {
    player.devCards.forEach(card => {
      if (card.type === 'victory_point') hiddenVP += 1;
    });
  }

  const totalPoints = publicPoints + hiddenVP;
  player.publicVictoryPoints = publicPoints;

  return { publicPoints, hiddenVP, totalPoints };
}
