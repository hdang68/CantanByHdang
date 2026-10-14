/**
 * PURE GAME ENGINE - RESOURCES & FINITE BANK MANAGEMENT
 */

export const RESOURCE_TYPES = ['wood', 'clay', 'sheep', 'wheat', 'ore'];

export const BUILDING_COSTS = {
  road: { wood: 1, clay: 1 },
  settlement: { wood: 1, clay: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  development_card: { sheep: 1, wheat: 1, ore: 1 }
};

export const INITIAL_BANK_AMOUNT = 19;

export function createInitialBank() {
  return {
    wood: INITIAL_BANK_AMOUNT,
    clay: INITIAL_BANK_AMOUNT,
    sheep: INITIAL_BANK_AMOUNT,
    wheat: INITIAL_BANK_AMOUNT,
    ore: INITIAL_BANK_AMOUNT
  };
}

export function createEmptyResources() {
  return {
    wood: 0,
    clay: 0,
    sheep: 0,
    wheat: 0,
    ore: 0
  };
}

export function getTotalResourceCount(resources) {
  if (!resources) return 0;
  return Object.values(resources).reduce((sum, count) => sum + (count || 0), 0);
}

export function canAfford(playerResources, cost) {
  if (!playerResources || !cost) return false;
  for (const [res, amount] of Object.entries(cost)) {
    if ((playerResources[res] || 0) < amount) {
      return false;
    }
  }
  return true;
}

export function deductCost(playerResources, cost, bank = null) {
  if (!canAfford(playerResources, cost)) {
    throw new Error('Không đủ tài nguyên để chi trả.');
  }

  for (const [res, amount] of Object.entries(cost)) {
    playerResources[res] -= amount;
    if (bank && typeof bank[res] === 'number') {
      bank[res] += amount;
    }
  }
}

export function addResources(playerResources, gain, bank = null) {
  for (const [res, amount] of Object.entries(gain)) {
    if (amount <= 0) continue;
    if (bank && typeof bank[res] === 'number') {
      const available = Math.min(bank[res], amount);
      playerResources[res] = (playerResources[res] || 0) + available;
      bank[res] -= available;
    } else {
      playerResources[res] = (playerResources[res] || 0) + amount;
    }
  }
}

/**
 * Phân phối tài nguyên sản xuất khi gieo xúc xắc (2-12, trừ 7).
 * Áp dụng luật Ngân hàng hữu hạn Catan chính thức:
 * Nếu Ngân hàng không đủ loại tài nguyên đó để trả cho TẤT CẢ người được hưởng,
 * thì KHÔNG AI được nhận loại tài nguyên đó trong lượt này!
 */
export function distributeProduction(board, diceRoll, players, bank) {
  if (diceRoll === 7) {
    return { distributions: {}, depletedResources: [] };
  }

  // Bước 1: Tính toán tổng số lượng tài nguyên mỗi người chơi được hưởng
  const pendingByPlayer = {};
  const totalOwedPerResource = { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 };
  const pendingEvents = [];

  Object.keys(players).forEach(pId => {
    pendingByPlayer[pId] = createEmptyResources();
  });

  // Tìm các ô lục giác sản xuất số này và không bị tên cướp chặn
  const activeHexes = Object.values(board.hexes).filter(
    h => h.diceNumber === diceRoll && !h.hasRobber && h.resource !== null
  );

  activeHexes.forEach(hex => {
    const res = hex.resource;
    hex.vertexIds.forEach(vId => {
      const vertex = board.vertices[vId];
      if (vertex && vertex.building && players[vertex.building.playerId]) {
        const pId = vertex.building.playerId;
        const count = vertex.building.type === 'city' ? 2 : 1;
        pendingByPlayer[pId][res] += count;
        totalOwedPerResource[res] += count;
        pendingEvents.push({ hexId: hex.id, resource: res, playerId: pId, count });
      }
    });
  });

  // Bước 2: Kiểm tra kho Ngân hàng hữu hạn
  const distributions = {};
  const depletedResources = [];
  const productionEvents = [];

  Object.keys(players).forEach(pId => {
    distributions[pId] = createEmptyResources();
  });

  RESOURCE_TYPES.forEach(res => {
    const owed = totalOwedPerResource[res];
    if (owed === 0) return;

    if (bank[res] < owed) {
      // Ngân hàng không đủ hàng -> Luật Catan: Không ai được nhận loại tài nguyên này!
      depletedResources.push(res);
    } else {
      // Ngân hàng đủ hàng -> Phát cho từng người chơi và trừ khỏi ngân hàng
      Object.keys(players).forEach(pId => {
        const amount = pendingByPlayer[pId][res];
        if (amount > 0) {
          distributions[pId][res] = amount;
          players[pId].resources[res] += amount;
          bank[res] -= amount;
        }
      });
      pendingEvents.filter(e => e.resource === res).forEach(e => {
        productionEvents.push(e);
      });
    }
  });

  return { distributions, depletedResources, productionEvents };
}
