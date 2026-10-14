/**
 * PURE GAME ENGINE - ROBBER & 7-ROLL EVENT HANDLING
 */

import { getTotalResourceCount, deductCost } from './resources.js';

/**
 * Kiểm tra danh sách những người chơi phải bỏ bài khi ra số 7 (> 7 thẻ tài nguyên)
 * Số lượng bỏ: Math.floor(tổng_thẻ / 2)
 */
export function checkDiscardRequirements(players) {
  const pendingDiscards = {};

  Object.values(players).forEach(player => {
    const total = getTotalResourceCount(player.resources);
    if (total > 7) {
      pendingDiscards[player.id] = Math.floor(total / 2);
    }
  });

  return pendingDiscards;
}

/**
 * Thực thi việc bỏ bài của một người chơi
 */
export function executeDiscard(player, bank, discardedResources, requiredCount) {
  const totalDiscarded = getTotalResourceCount(discardedResources);
  if (totalDiscarded !== requiredCount) {
    return { success: false, error: `Bạn cần bỏ chính xác ${requiredCount} thẻ tài nguyên (bạn đã chọn ${totalDiscarded}).` };
  }

  // Kiểm tra người chơi có đủ số thẻ đã chọn không
  for (const [res, count] of Object.entries(discardedResources)) {
    if (count < 0 || (player.resources[res] || 0) < count) {
      return { success: false, error: `Bạn không có đủ ${count} ${res} để bỏ.` };
    }
  }

  // Trừ tài nguyên và trả lại ngân hàng
  deductCost(player.resources, discardedResources, bank);
  return { success: true };
}

/**
 * Thẩm định và di chuyển Tên cướp sang ô lục giác mới
 */
export function executeMoveRobber(board, newHexId) {
  const newHex = board.hexes[newHexId];
  if (!newHex) {
    return { success: false, error: 'Ô lục giác không tồn tại.' };
  }

  if (board.robberHexId === newHexId) {
    return { success: false, error: 'Tên cướp bắt buộc phải được chuyển sang một ô địa hình khác.' };
  }

  // Cập nhật vị trí tên cướp trên bàn cờ
  if (board.robberHexId && board.hexes[board.robberHexId]) {
    board.hexes[board.robberHexId].hasRobber = false;
  }
  newHex.hasRobber = true;
  board.robberHexId = newHexId;

  return { success: true };
}

/**
 * Tìm danh sách các đối thủ hợp lệ có thể bị cướp thẻ tại ô Tên cướp mới
 */
export function getEligibleStealVictims(board, hexId, activePlayerId, players) {
  const hex = board.hexes[hexId];
  if (!hex) return [];

  const eligibleVictimIds = new Set();

  hex.vertexIds.forEach(vId => {
    const vertex = board.vertices[vId];
    if (vertex && vertex.building && vertex.building.playerId !== activePlayerId) {
      const victim = players[vertex.building.playerId];
      // Đối thủ phải có ít nhất 1 thẻ tài nguyên để cướp
      if (victim && getTotalResourceCount(victim.resources) > 0) {
        eligibleVictimIds.add(victim.id);
      }
    }
  });

  return Array.from(eligibleVictimIds).map(pId => players[pId]);
}

/**
 * Cướp 1 thẻ tài nguyên ngẫu nhiên từ đối thủ
 */
export function executeSteal(activePlayer, victimPlayer) {
  const cardPool = [];
  for (const [res, count] of Object.entries(victimPlayer.resources)) {
    for (let i = 0; i < count; i++) {
      cardPool.push(res);
    }
  }

  if (cardPool.length === 0) {
    return { success: false, error: 'Đối thủ không có tài nguyên nào để cướp.' };
  }

  // Chọn ngẫu nhiên 1 thẻ
  const randomIndex = Math.floor(Math.random() * cardPool.length);
  const stolenResource = cardPool[randomIndex];

  // Chuyển thẻ
  victimPlayer.resources[stolenResource] -= 1;
  activePlayer.resources[stolenResource] = (activePlayer.resources[stolenResource] || 0) + 1;

  return {
    success: true,
    stolenResource,
    victimId: victimPlayer.id,
    victimName: victimPlayer.name
  };
}
