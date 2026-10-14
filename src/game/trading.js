/**
 * PURE GAME ENGINE - TRADING SUBSYSTEM
 * Quản lý giao dịch giữa người chơi và giao dịch với ngân hàng/cảng.
 */

import { getTotalResourceCount, deductCost, addResources } from './resources.js';
import { validateBankTrade } from './rules.js';

let tradeIdCounter = 1;

/**
 * Tạo lời đề nghị giao dịch từ người chơi đang trong lượt
 */
export function createTradeOffer(activePlayer, { give, receive, targetPlayerId = null }) {
  // Kiểm tra tài nguyên đưa ra
  const giveTotal = getTotalResourceCount(give);
  const receiveTotal = getTotalResourceCount(receive);

  if (giveTotal === 0 || receiveTotal === 0) {
    return { success: false, error: 'Giao dịch phải đưa ra và nhận về ít nhất 1 tài nguyên.' };
  }

  // Người chơi phải thực sự sở hữu tài nguyên đưa ra
  for (const [res, amount] of Object.entries(give)) {
    if (amount < 0 || (activePlayer.resources[res] || 0) < amount) {
      return { success: false, error: `Bạn không có đủ ${amount} ${res} để trao đổi.` };
    }
  }

  // Không cho phép đổi cùng 1 loại tài nguyên cho nhau (VD: 1 Gỗ lấy 1 Gỗ)
  for (const res of Object.keys(give)) {
    if (give[res] > 0 && receive[res] > 0) {
      return { success: false, error: 'Không thể vừa đưa vừa nhận cùng một loại tài nguyên.' };
    }
  }

  const tradeOffer = {
    id: `trade_${tradeIdCounter++}`,
    senderId: activePlayer.id,
    targetPlayerId, // null = gửi tới tất cả người chơi
    give: { ...give },
    receive: { ...receive },
    acceptedPlayerIds: [],
    rejectedPlayerIds: [],
    status: 'PENDING', // 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED'
    createdAt: Date.now()
  };

  return { success: true, tradeOffer };
}

/**
 * Thực thi giao dịch nguyên tử giữa 2 người chơi (Atomic Player Trade)
 */
export function executePlayerTrade(playerA, playerB, tradeOffer) {
  if (tradeOffer.status !== 'PENDING') {
    return { success: false, error: 'Lời đề nghị giao dịch không còn hiệu lực.' };
  }

  // Kiểm tra lần cuối tại thời điểm thực hiện (Tránh race condition hoặc gian lận)
  for (const [res, amount] of Object.entries(tradeOffer.give)) {
    if ((playerA.resources[res] || 0) < amount) {
      return { success: false, error: `${playerA.name} không còn đủ tài nguyên để giao dịch.` };
    }
  }

  for (const [res, amount] of Object.entries(tradeOffer.receive)) {
    if ((playerB.resources[res] || 0) < amount) {
      return { success: false, error: `${playerB.name} không đủ tài nguyên để hoàn tất giao dịch.` };
    }
  }

  // Trừ và cộng tài nguyên nguyên tử
  deductCost(playerA.resources, tradeOffer.give);
  addResources(playerA.resources, tradeOffer.receive);

  deductCost(playerB.resources, tradeOffer.receive);
  addResources(playerB.resources, tradeOffer.give);

  tradeOffer.status = 'COMPLETED';

  return { success: true };
}

/**
 * Thực thi giao dịch với Ngân hàng hoặc qua Cảng
 */
export function executeBankTrade(board, player, bank, giveResource, getResource) {
  const validation = validateBankTrade(board, player.id, player.resources, bank, giveResource, getResource);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const cost = validation.cost;

  // Thực hiện giao dịch
  player.resources[giveResource] -= cost;
  bank[giveResource] += cost;

  bank[getResource] -= 1;
  player.resources[getResource] = (player.resources[getResource] || 0) + 1;

  return { success: true, ratioUsed: cost };
}
