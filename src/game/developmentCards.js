/**
 * PURE GAME ENGINE - DEVELOPMENT CARDS
 * Quản lý bộ 25 thẻ phát triển chuẩn Catan Classic và quy chế sử dụng.
 */

import { BUILDING_COSTS, deductCost, canAfford } from './resources.js';

export const DEV_CARD_TYPES = {
  KNIGHT: 'knight',
  VICTORY_POINT: 'victory_point',
  ROAD_BUILDING: 'road_building',
  YEAR_OF_PLENTY: 'year_of_plenty',
  MONOPOLY: 'monopoly'
};

const DEV_CARD_DISTRIBUTION = [
  // 14 thẻ Knight
  ...Array(14).fill('knight'),
  // 5 thẻ Victory Point
  ...Array(5).fill('victory_point'),
  // 2 thẻ Road Building
  ...Array(2).fill('road_building'),
  // 2 thẻ Year of Plenty
  ...Array(2).fill('year_of_plenty'),
  // 2 thẻ Monopoly
  ...Array(2).fill('monopoly')
];

// Phân bổ thẻ phát triển cho bản đồ mở rộng 5-6 người (Tổng cộng 34 thẻ)
const DEV_CARD_DISTRIBUTION_56 = [
  ...Array(20).fill('knight'),
  ...Array(5).fill('victory_point'),
  ...Array(3).fill('road_building'),
  ...Array(3).fill('year_of_plenty'),
  ...Array(3).fill('monopoly')
];

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createDevCardDeck(is56 = false) {
  const dist = is56 ? DEV_CARD_DISTRIBUTION_56 : DEV_CARD_DISTRIBUTION;
  const shuffledTypes = shuffle(dist);
  return shuffledTypes.map((type, index) => ({
    id: `dc_${index}_${type}`,
    type
  }));
}

/**
 * Mua một thẻ phát triển từ bộ bài (Tốn 1 Sheep, 1 Wheat, 1 Ore)
 */
export function buyDevCard(deck, player, bank, currentTurnNumber) {
  if (deck.length === 0) {
    return { success: false, error: 'Bộ thẻ phát triển đã hết.' };
  }

  const cost = BUILDING_COSTS.development_card;
  if (!canAfford(player.resources, cost)) {
    return { success: false, error: 'Không đủ tài nguyên để mua Thẻ phát triển (Cần 1 Cừu, 1 Lúa mì, 1 Quặng).' };
  }

  // Trừ tài nguyên và trả về ngân hàng
  deductCost(player.resources, cost, bank);

  // Rút thẻ trên cùng
  const card = deck.pop();
  const playerCard = {
    id: card.id,
    type: card.type,
    turnBought: currentTurnNumber,
    isPlayed: false
  };

  if (!player.devCards) player.devCards = [];
  player.devCards.push(playerCard);

  return { success: true, card: playerCard, cardsRemaining: deck.length };
}

/**
 * Kiểm tra xem thẻ phát triển có được phép chơi trong lượt này không
 */
export function canPlayDevCard(card, currentTurnNumber, devCardPlayedThisTurn) {
  if (!card) {
    return { canPlay: false, error: 'Thẻ không tồn tại.' };
  }

  // Thẻ Victory Point không cần chơi chủ động, được tính điểm tự động
  if (card.type === DEV_CARD_TYPES.VICTORY_POINT) {
    return { canPlay: false, error: 'Thẻ Điểm chiến thắng không cần đánh ra, được tính tự động khi đủ 10 điểm.' };
  }

  // Mỗi lượt chỉ được chơi tối đa 1 thẻ phát triển
  if (devCardPlayedThisTurn) {
    return { canPlay: false, error: 'Bạn đã chơi một thẻ phát triển trong lượt này rồi.' };
  }

  // Không được chơi thẻ vừa mua trong cùng lượt
  if (card.turnBought === currentTurnNumber) {
    return { canPlay: false, error: 'Không được chơi thẻ phát triển vừa mua trong cùng lượt.' };
  }

  return { canPlay: true };
}

/**
 * Thực thi hiệu ứng Thẻ Monopoly (Thu gom 1 loại tài nguyên từ tất cả đối thủ)
 */
export function executeMonopoly(players, activePlayerId, targetResource) {
  const activePlayer = players[activePlayerId];
  if (!activePlayer) return 0;

  let totalCollected = 0;

  Object.values(players).forEach(opponent => {
    if (opponent.id !== activePlayerId && opponent.resources[targetResource]) {
      const amount = opponent.resources[targetResource];
      if (amount > 0) {
        opponent.resources[targetResource] = 0;
        totalCollected += amount;
      }
    }
  });

  activePlayer.resources[targetResource] = (activePlayer.resources[targetResource] || 0) + totalCollected;
  return totalCollected;
}

/**
 * Thực thi hiệu ứng Thẻ Year of Plenty (Lấy 2 tài nguyên bất kỳ từ ngân hàng)
 */
export function executeYearOfPlenty(player, bank, res1, res2) {
  if (!res1 || !res2) {
    return { success: false, error: 'Vui lòng chọn đủ 2 tài nguyên.' };
  }

  if (res1 === res2) {
    if (bank[res1] < 2) {
      return { success: false, error: `Ngân hàng không đủ 2 ${res1}.` };
    }
    bank[res1] -= 2;
    player.resources[res1] += 2;
  } else {
    if (bank[res1] < 1 || bank[res2] < 1) {
      return { success: false, error: 'Ngân hàng không đủ tài nguyên được yêu cầu.' };
    }
    bank[res1] -= 1;
    bank[res2] -= 1;
    player.resources[res1] += 1;
    player.resources[res2] += 1;
  }

  return { success: true };
}
