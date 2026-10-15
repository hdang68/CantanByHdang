/**
 * PURE GAME ENGINE - CORE STATE MACHINE & ACTION DISPATCHER
 * Độc lập 100% với DOM, CSS, SVG và Socket.IO.
 */

import {
  createStandardBoard,
  createRandomBoard
} from './board.js';

import {
  createInitialBank,
  createEmptyResources,
  getTotalResourceCount,
  canAfford,
  deductCost,
  addResources,
  distributeProduction,
  BUILDING_COSTS
} from './resources.js';

import {
  validateSettlementPlacement,
  validateCityPlacement,
  validateRoadPlacement,
  PIECE_LIMITS
} from './rules.js';

import {
  createDevCardDeck,
  buyDevCard,
  canPlayDevCard,
  executeMonopoly,
  executeYearOfPlenty,
  DEV_CARD_TYPES
} from './developmentCards.js';

import {
  createTradeOffer,
  executePlayerTrade,
  executeBankTrade
} from './trading.js';

import {
  checkDiscardRequirements,
  executeDiscard,
  executeMoveRobber,
  getEligibleStealVictims,
  executeSteal
} from './robber.js';

import {
  updateLongestRoadAward,
  updateLargestArmyAward,
  calculateVictoryPoints
} from './scoring.js';

export const GAME_PHASES = {
  SETUP_ROUND_1: 'SETUP_ROUND_1',         // Lượt đặt 1 (xuôi): Settlement -> Road
  SETUP_ROUND_2: 'SETUP_ROUND_2',         // Lượt đặt 2 (ngược): Settlement -> Road + nhận tài nguyên
  TURN_ROLL: 'TURN_ROLL',                 // Đầu lượt, chờ gieo xúc xắc (hoặc đánh Knight trước)
  TURN_ROBBER_DISCARD: 'TURN_ROBBER_DISCARD', // Chờ người chơi > 7 thẻ bỏ bài khi ra 7
  TURN_ROBBER_MOVE: 'TURN_ROBBER_MOVE',   // Chờ di chuyển Tên cướp
  TURN_ROBBER_STEAL: 'TURN_ROBBER_STEAL', // Chờ chọn người bị cướp
  TURN_MAIN: 'TURN_MAIN',                 // Giai đoạn chính: Giao dịch & Xây dựng
  GAME_OVER: 'GAME_OVER'                  // Kết thúc ván đấu
};

export class CatanEngine {
  constructor(playersList, options = {}) {
    if (!playersList || playersList.length < 2 || playersList.length > 4) {
      throw new Error('Catan Classic yêu cầu từ 2 đến 4 người chơi (tối thiểu 3 cho ván chính thức).');
    }

    this.board = options.board || (options.isRandomBoard ? createRandomBoard() : createStandardBoard());
    this.bank = createInitialBank();
    this.devCardDeck = createDevCardDeck();

    this.players = {};
    this.turnOrder = playersList.map(p => p.id);

    playersList.forEach((p, idx) => {
      this.players[p.id] = {
        id: p.id,
        name: p.name || `Người chơi ${idx + 1}`,
        color: p.color || { hex: '#e74c3c' },
        resources: createEmptyResources(),
        pieces: {
          roadsRemaining: PIECE_LIMITS.roads,
          settlementsRemaining: PIECE_LIMITS.settlements,
          citiesRemaining: PIECE_LIMITS.cities
        },
        devCards: [],
        knightsPlayed: 0,
        hasLongestRoad: false,
        longestRoadLength: 0,
        hasLargestArmy: false,
        publicVictoryPoints: 0,
        totalVictoryPoints: 0
      };
    });

    // Quản lý tiến trình ván đấu
    this.phase = GAME_PHASES.SETUP_ROUND_1;
    this.turnNumber = 1;
    this.currentTurnIndex = 0; // Chỉ số trong turnOrder
    this.setupStep = 'SETTLEMENT'; // 'SETTLEMENT' | 'ROAD'
    this.setupLastSettlementVertexId = null;

    this.dice = [1, 1];
    this.diceRolledThisTurn = false;
    this.devCardPlayedThisTurn = false;

    // Trạng thái phụ
    this.pendingDiscards = {}; // { [playerId]: count }
    this.eligibleStealVictims = [];
    this.pendingTrade = null;

    this.awards = {
      longestRoad: { playerId: null, length: 0 },
      largestArmy: { playerId: null, count: 0 }
    };

    this.winnerId = null;
    this.eventLog = [];
    this.lastProduction = null;
    this.lastProductionId = null;
    this.lastSpent = null;
    this.lastBankTrade = null;
    this.lastPlayerTrade = null;
    this.lastSteal = null;
    this.lastDevCardBought = null;
    this.lastDevCardPlayed = null;
  }

  getCurrentPlayer() {
    return this.players[this.turnOrder[this.currentTurnIndex]];
  }

  logEvent(text, type = 'info') {
    this.eventLog.push({
      time: Date.now(),
      text,
      type
    });
  }

  // ========================================================
  // 1. GIAI ĐOẠN KHỞI TẠO (SETUP PHASE)
  // ========================================================

  setupBuildSettlement(playerId, vertexId) {
    if (this.phase !== GAME_PHASES.SETUP_ROUND_1 && this.phase !== GAME_PHASES.SETUP_ROUND_2) {
      return { success: false, error: 'Không phải giai đoạn thiết lập ban đầu.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    if (this.setupStep !== 'SETTLEMENT') {
      return { success: false, error: 'Bạn phải đặt con đường nối với khu định cư vừa xây.' };
    }

    const validation = validateSettlementPlacement(this.board, vertexId, playerId, { isSetupPhase: true });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Đặt khu định cư
    const vertex = this.board.vertices[vertexId];
    const playerColorHex = (typeof currentP.color === 'string' ? currentP.color : currentP.color?.hex) || '#e74c3c';
    vertex.building = { playerId, type: 'settlement', color: playerColorHex };
    currentP.pieces.settlementsRemaining -= 1;
    this.setupLastSettlementVertexId = vertexId;

    // Nếu ở SETUP_ROUND_2 -> Nhận tài nguyên khởi đầu từ các ô kề không phải Sa mạc
    if (this.phase === GAME_PHASES.SETUP_ROUND_2) {
      const initialResources = [];
      const prodEvents = [];
      vertex.adjacentHexIds.forEach(hexId => {
        const hex = this.board.hexes[hexId];
        if (hex && hex.resource) {
          currentP.resources[hex.resource] += 1;
          this.bank[hex.resource] -= 1;
          initialResources.push(hex.resource);
          prodEvents.push({ hexId, resource: hex.resource, playerId, count: 1 });
        }
      });
      this.lastProduction = prodEvents;
      this.lastProductionId = `prod_setup_${Date.now()}_${Math.random()}`;
      this.logEvent(`${currentP.name} đặt Khu định cư thứ hai và nhận [${initialResources.join(', ')}]`, 'success');
    } else {
      this.lastProduction = null;
      this.lastProductionId = null;
      this.logEvent(`${currentP.name} đặt Khu định cư đầu tiên`, 'info');
    }

    this.setupStep = 'ROAD';
    this.updateScores();
    return { success: true };
  }

  setupBuildRoad(playerId, edgeId) {
    if (this.phase !== GAME_PHASES.SETUP_ROUND_1 && this.phase !== GAME_PHASES.SETUP_ROUND_2) {
      return { success: false, error: 'Không phải giai đoạn thiết lập ban đầu.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    if (this.setupStep !== 'ROAD') {
      return { success: false, error: 'Bạn phải đặt khu định cư trước.' };
    }

    const validation = validateRoadPlacement(this.board, edgeId, playerId, {
      isSetupPhase: true,
      setupSettlementVertexId: this.setupLastSettlementVertexId
    });

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Đặt đường
    const edge = this.board.edges[edgeId];
    const roadColorHex = (typeof currentP.color === 'string' ? currentP.color : currentP.color?.hex) || '#e74c3c';
    edge.road = { playerId, color: roadColorHex };
    currentP.pieces.roadsRemaining -= 1;
    this.logEvent(`${currentP.name} đặt con đường nối với Khu định cư`, 'info');

    // Chuyển lượt trong Setup Phase
    this.setupStep = 'SETTLEMENT';
    this.setupLastSettlementVertexId = null;

    if (this.phase === GAME_PHASES.SETUP_ROUND_1) {
      if (this.currentTurnIndex < this.turnOrder.length - 1) {
        // Tiếp tục theo chiều xuôi
        this.currentTurnIndex += 1;
      } else {
        // Đã tới người cuối cùng -> Chuyển sang SETUP_ROUND_2 (người cuối cùng đi tiếp)
        this.phase = GAME_PHASES.SETUP_ROUND_2;
        this.logEvent('Bắt đầu lượt đặt thứ hai theo chiều ngược lại.', 'system');
      }
    } else if (this.phase === GAME_PHASES.SETUP_ROUND_2) {
      if (this.currentTurnIndex > 0) {
        // Tiếp tục theo chiều ngược
        this.currentTurnIndex -= 1;
      } else {
        // Hoàn tất giai đoạn thiết lập! Bắt đầu ván đấu chính thức với Player 1
        this.phase = GAME_PHASES.TURN_ROLL;
        this.currentTurnIndex = 0;
        this.turnNumber = 1;
        this.logEvent('Giai đoạn thiết lập hoàn tất! Bắt đầu lượt chơi thông thường.', 'system');
      }
    }

    this.updateScores();
    return { success: true };
  }

  // ========================================================
  // 2. GIEO XÚC XẮC & THU HOẠCH TÀI NGUYÊN
  // ========================================================

  rollDice(playerId) {
    if (this.phase !== GAME_PHASES.TURN_ROLL) {
      return { success: false, error: 'Chưa thể gieo xúc xắc lúc này.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;

    this.dice = [d1, d2];
    this.diceRolledThisTurn = true;
    this.logEvent(`${currentP.name} gieo xúc xắc được ${sum} (${d1} + ${d2})`, 'dice');

    if (sum === 7) {
      // Kích hoạt sự kiện Tên cướp và số 7
      const pending = checkDiscardRequirements(this.players);
      const needDiscardIds = Object.keys(pending);

      if (needDiscardIds.length > 0) {
        this.phase = GAME_PHASES.TURN_ROBBER_DISCARD;
        this.pendingDiscards = pending;
        this.logEvent(`Xúc xắc ra 7! Có ${needDiscardIds.length} người chơi phải bỏ một nửa số thẻ tài nguyên.`, 'warning');
      } else {
        this.phase = GAME_PHASES.TURN_ROBBER_MOVE;
        this.logEvent(`Xúc xắc ra 7! Không ai có quá 7 thẻ. ${currentP.name} phải di chuyển Tên cướp.`, 'warning');
      }

      this.lastProduction = null;
      this.lastProductionId = null;
      return { success: true, dice: [d1, d2], sum, isSeven: true };
    } else {
      // Thu hoạch tài nguyên bình thường
      const { distributions, depletedResources, productionEvents } = distributeProduction(this.board, sum, this.players, this.bank);
      this.lastProduction = productionEvents || [];
      this.lastProductionId = `prod_${Date.now()}_${Math.random()}`;

      if (depletedResources.length > 0) {
        this.logEvent(`Ngân hàng không đủ tài nguyên [${depletedResources.join(', ')}], không ai được nhận loại này!`, 'warning');
      }

      this.phase = GAME_PHASES.TURN_MAIN;
      return { success: true, dice: [d1, d2], sum, isSeven: false, distributions, productionEvents };
    }
  }

  // ========================================================
  // 3. XỬ LÝ SỰ KIỆN SỐ 7 & TÊN CƯỚP
  // ========================================================

  discardResources(playerId, discardedResources) {
    if (this.phase !== GAME_PHASES.TURN_ROBBER_DISCARD) {
      return { success: false, error: 'Không phải giai đoạn bỏ bài.' };
    }

    const required = this.pendingDiscards[playerId];
    if (required === undefined) {
      return { success: false, error: 'Bạn không nằm trong danh sách phải bỏ bài.' };
    }

    const player = this.players[playerId];
    const result = executeDiscard(player, this.bank, discardedResources, required);
    if (!result.success) {
      return result;
    }

    delete this.pendingDiscards[playerId];
    this.lastSpent = { id: `spent_${Date.now()}_${Math.random()}`, playerId, cost: { ...discardedResources }, type: 'discard' };
    this.lastProduction = null;
    this.lastProductionId = null;
    this.logEvent(`${player.name} đã bỏ ${required} thẻ tài nguyên.`, 'info');

    // Nếu tất cả người chơi đã bỏ bài xong -> Chuyển sang di chuyển Tên cướp
    if (Object.keys(this.pendingDiscards).length === 0) {
      this.phase = GAME_PHASES.TURN_ROBBER_MOVE;
      const currentP = this.getCurrentPlayer();
      this.logEvent(`Tất cả đã bỏ bài xong. ${currentP.name} hãy di chuyển Tên cướp.`, 'system');
    }

    return { success: true };
  }

  moveRobber(playerId, targetHexId) {
    if (this.phase !== GAME_PHASES.TURN_ROBBER_MOVE) {
      return { success: false, error: 'Chưa tới bước di chuyển Tên cướp.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chỉ người đang trong lượt mới có quyền di chuyển Tên cướp.' };
    }

    const result = executeMoveRobber(this.board, targetHexId);
    if (!result.success) {
      return result;
    }

    this.logEvent(`${currentP.name} đã chuyển Tên cướp sang ô ${targetHexId}.`, 'info');

    // Tìm các nạn nhân hợp lệ
    const victims = getEligibleStealVictims(this.board, targetHexId, playerId, this.players);
    this.eligibleStealVictims = victims;

    if (victims.length > 0) {
      this.phase = GAME_PHASES.TURN_ROBBER_STEAL;
      return { success: true, mustSteal: true, victims: victims.map(v => ({ id: v.id, name: v.name })) };
    } else {
      this.phase = GAME_PHASES.TURN_MAIN;
      return { success: true, mustSteal: false };
    }
  }

  stealResource(playerId, victimPlayerId) {
    if (this.phase !== GAME_PHASES.TURN_ROBBER_STEAL) {
      return { success: false, error: 'Chưa tới bước cướp tài nguyên.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const victim = this.players[victimPlayerId];
    if (!victim || !this.eligibleStealVictims.some(v => v.id === victimPlayerId)) {
      return { success: false, error: 'Đối thủ này không hợp lệ để cướp.' };
    }

    const result = executeSteal(currentP, victim);
    if (!result.success) {
      return result;
    }

    this.lastSteal = {
      id: `steal_${Date.now()}_${Math.random()}`,
      stealerId: playerId,
      victimId: victim.id,
      stolenResource: result.stolenResource
    };

    this.logEvent(`${currentP.name} đã cướp 1 thẻ tài nguyên từ ${victim.name}.`, 'warning');
    this.eligibleStealVictims = [];
    this.phase = GAME_PHASES.TURN_MAIN;

    return {
      success: true,
      stolenResource: result.stolenResource,
      victimId: victim.id,
      victimName: victim.name
    };
  }

  // ========================================================
  // 4. XÂY DỰNG CÔNG TRÌNH TRONG LƯỢT CHÍNH (MAIN PHASE)
  // ========================================================

  buildRoad(playerId, edgeId, { free = false } = {}) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Không thể xây đường ở giai đoạn này.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    if (currentP.pieces.roadsRemaining <= 0) {
      return { success: false, error: 'Bạn đã sử dụng hết tối đa 15 con đường.' };
    }

    const cost = BUILDING_COSTS.road;
    if (!free && !canAfford(currentP.resources, cost)) {
      return { success: false, error: 'Không đủ tài nguyên xây đường (Cần 1 Gỗ, 1 Đất sét).' };
    }

    const validation = validateRoadPlacement(this.board, edgeId, playerId, { isSetupPhase: false });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (!free) {
      deductCost(currentP.resources, cost, this.bank);
      this.lastSpent = { id: `spent_${Date.now()}_${Math.random()}`, playerId, cost, type: 'road' };
      this.lastProduction = null;
      this.lastProductionId = null;
    }

    const edge = this.board.edges[edgeId];
    const roadColorHex = (typeof currentP.color === 'string' ? currentP.color : currentP.color?.hex) || '#e74c3c';
    edge.road = { playerId, color: roadColorHex };
    currentP.pieces.roadsRemaining -= 1;

    this.logEvent(`${currentP.name} đã xây một con đường`, 'info');
    this.updateScores();
    return { success: true };
  }

  buildSettlement(playerId, vertexId) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Không thể xây khu định cư ở giai đoạn này.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    if (currentP.pieces.settlementsRemaining <= 0) {
      return { success: false, error: 'Bạn đã sử dụng hết tối đa 5 Khu định cư.' };
    }

    const cost = BUILDING_COSTS.settlement;
    if (!canAfford(currentP.resources, cost)) {
      return { success: false, error: 'Không đủ tài nguyên xây Khu định cư (Cần 1 Gỗ, 1 Đất sét, 1 Cừu, 1 Lúa mì).' };
    }

    const validation = validateSettlementPlacement(this.board, vertexId, playerId, { isSetupPhase: false });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    deductCost(currentP.resources, cost, this.bank);
    this.lastSpent = { id: `spent_${Date.now()}_${Math.random()}`, playerId, cost, type: 'settlement' };
    this.lastProduction = null;
    this.lastProductionId = null;

    const vertex = this.board.vertices[vertexId];
    const playerColorHex = (typeof currentP.color === 'string' ? currentP.color : currentP.color?.hex) || '#e74c3c';
    vertex.building = { playerId, type: 'settlement', color: playerColorHex };
    currentP.pieces.settlementsRemaining -= 1;

    this.logEvent(`${currentP.name} đã xây một Khu định cư (+1 Điểm)`, 'success');
    this.updateScores();
    return { success: true };
  }

  buildCity(playerId, vertexId) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Không thể nâng cấp thành phố ở giai đoạn này.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    if (currentP.pieces.citiesRemaining <= 0) {
      return { success: false, error: 'Bạn đã sử dụng hết tối đa 4 Thành phố.' };
    }

    const cost = BUILDING_COSTS.city;
    if (!canAfford(currentP.resources, cost)) {
      return { success: false, error: 'Không đủ tài nguyên nâng cấp Thành phố (Cần 2 Lúa mì, 3 Quặng).' };
    }

    const validation = validateCityPlacement(this.board, vertexId, playerId);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    deductCost(currentP.resources, cost, this.bank);
    this.lastSpent = { id: `spent_${Date.now()}_${Math.random()}`, playerId, cost, type: 'city' };
    this.lastProduction = null;
    this.lastProductionId = null;

    const vertex = this.board.vertices[vertexId];
    vertex.building.type = 'city';
    currentP.pieces.citiesRemaining -= 1;
    currentP.pieces.settlementsRemaining += 1; // Thu hồi lại 1 quân Settlement về kho

    this.logEvent(`${currentP.name} đã nâng cấp lên Thành phố (+2 Điểm)`, 'success');
    this.updateScores();
    return { success: true };
  }

  // ========================================================
  // 5. THẺ PHÁT TRIỂN (DEVELOPMENT CARDS)
  // ========================================================

  buyDevCardAction(playerId) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Chỉ có thể mua thẻ phát triển trong lượt chính.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const result = buyDevCard(this.devCardDeck, currentP, this.bank, this.turnNumber);
    if (!result.success) {
      return result;
    }

    this.lastSpent = { id: `spent_${Date.now()}_${Math.random()}`, playerId, cost: BUILDING_COSTS.devCard, type: 'dev_card' };
    this.lastDevCardBought = {
      id: `buy_dev_${Date.now()}_${Math.random()}`,
      playerId,
      cardType: result.card?.type || 'dev_card'
    };
    this.lastProduction = null;
    this.lastProductionId = null;
    this.logEvent(`${currentP.name} đã mua 1 Thẻ phát triển.`, 'info');
    this.updateScores();
    return { success: true, card: result.card };
  }

  playKnight(playerId) {
    // Được phép đánh Knight TRƯỚC HOẶC SAU khi gieo xúc xắc
    if (this.phase !== GAME_PHASES.TURN_ROLL && this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Không thể đánh thẻ Knight lúc này.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const knightCard = currentP.devCards.find(c => c.type === DEV_CARD_TYPES.KNIGHT && !c.isPlayed);
    if (!knightCard) {
      return { success: false, error: 'Bạn không có thẻ Knight.' };
    }

    const validation = canPlayDevCard(knightCard, this.turnNumber, this.devCardPlayedThisTurn);
    if (!validation.canPlay) {
      return { success: false, error: validation.error };
    }

    knightCard.isPlayed = true;
    currentP.knightsPlayed = (currentP.knightsPlayed || 0) + 1;
    this.devCardPlayedThisTurn = true;
    this.lastDevCardPlayed = {
      id: `play_knight_${Date.now()}_${Math.random()}`,
      playerId,
      cardType: DEV_CARD_TYPES.KNIGHT
    };

    this.logEvent(`${currentP.name} đã đánh thẻ Knight! Đội hiệp sĩ: ${currentP.knightsPlayed}`, 'warning');

    // Chuyển sang bước di chuyển tên cướp
    this.phase = GAME_PHASES.TURN_ROBBER_MOVE;
    this.updateScores();

    return { success: true };
  }

  playYearOfPlenty(playerId, res1, res2) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Chỉ có thể đánh thẻ trong giai đoạn chính.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const card = currentP.devCards.find(c => c.type === DEV_CARD_TYPES.YEAR_OF_PLENTY && !c.isPlayed);
    if (!card) return { success: false, error: 'Bạn không có thẻ Year of Plenty.' };

    const check = canPlayDevCard(card, this.turnNumber, this.devCardPlayedThisTurn);
    if (!check.canPlay) return { success: false, error: check.error };

    const result = executeYearOfPlenty(currentP, this.bank, res1, res2);
    if (!result.success) return result;

    card.isPlayed = true;
    this.devCardPlayedThisTurn = true;
    this.lastDevCardPlayed = {
      id: `play_yop_${Date.now()}_${Math.random()}`,
      playerId,
      cardType: DEV_CARD_TYPES.YEAR_OF_PLENTY,
      res1,
      res2
    };

    this.logEvent(`${currentP.name} dùng Year of Plenty để nhận [${res1}, ${res2}].`, 'success');

    return { success: true };
  }

  playMonopoly(playerId, targetResource) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Chỉ có thể đánh thẻ trong giai đoạn chính.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const card = currentP.devCards.find(c => c.type === DEV_CARD_TYPES.MONOPOLY && !c.isPlayed);
    if (!card) return { success: false, error: 'Bạn không có thẻ Monopoly.' };

    const check = canPlayDevCard(card, this.turnNumber, this.devCardPlayedThisTurn);
    if (!check.canPlay) return { success: false, error: check.error };

    const collected = executeMonopoly(this.players, playerId, targetResource);
    card.isPlayed = true;
    this.devCardPlayedThisTurn = true;
    this.lastDevCardPlayed = {
      id: `play_monopoly_${Date.now()}_${Math.random()}`,
      playerId,
      cardType: DEV_CARD_TYPES.MONOPOLY,
      targetResource,
      count: collected
    };

    this.logEvent(`${currentP.name} đánh Monopoly độc quyền [${targetResource}], gom được tổng cộng ${collected} thẻ!`, 'warning');

    return { success: true, count: collected };
  }

  // ========================================================
  // 6. GIAO DỊCH (TRADING)
  // ========================================================

  tradeWithBankAction(playerId, giveResource, getResource) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Chỉ có thể giao dịch trong giai đoạn chính.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    const result = executeBankTrade(this.board, currentP, this.bank, giveResource, getResource);
    if (!result.success) return result;

    this.lastBankTrade = {
      id: `bank_trade_${Date.now()}_${Math.random()}`,
      playerId,
      giveResource,
      giveCount: result.ratioUsed,
      getResource,
      getCount: 1
    };

    this.logEvent(`${currentP.name} đã đổi ${result.ratioUsed} ${giveResource} lấy 1 ${getResource} qua Cảng/Ngân hàng.`, 'info');
    return { success: true, ratioUsed: result.ratioUsed };
  }

  // ========================================================
  // 7. KẾT THÚC LƯỢT & ĐIỂM SỐ
  // ========================================================

  updateScores() {
    // 1. Cập nhật danh hiệu Longest Road
    this.awards.longestRoad = updateLongestRoadAward(this.board, this.players, this.awards.longestRoad);

    // 2. Cập nhật danh hiệu Largest Army
    this.awards.largestArmy = updateLargestArmyAward(this.players, this.awards.largestArmy);

    // 3. Tính điểm chiến thắng cho từng người
    Object.values(this.players).forEach(player => {
      const { publicPoints, totalPoints } = calculateVictoryPoints(player, this.board);
      player.totalVictoryPoints = totalPoints;

      // Kiểm tra điều kiện thắng (10 điểm trên lượt của mình)
      const isCurrentPlayer = (player.id === this.turnOrder[this.currentTurnIndex]);
      if (totalPoints >= 10 && isCurrentPlayer && this.phase !== GAME_PHASES.SETUP_ROUND_1 && this.phase !== GAME_PHASES.SETUP_ROUND_2) {
        this.phase = GAME_PHASES.GAME_OVER;
        this.winnerId = player.id;
        this.logEvent(`🎉 CHÚC MỪNG ${player.name} ĐÃ ĐẠT ${totalPoints} ĐIỂM VÀ GIÀNH CHIẾN THẮNG!`, 'victory');
      }
    });
  }

  endTurn(playerId) {
    if (this.phase !== GAME_PHASES.TURN_MAIN) {
      return { success: false, error: 'Bạn phải hoàn tất các bước bắt buộc trước khi kết thúc lượt.' };
    }

    const currentP = this.getCurrentPlayer();
    if (currentP.id !== playerId) {
      return { success: false, error: 'Chưa tới lượt của bạn.' };
    }

    this.logEvent(`${currentP.name} kết thúc lượt.`, 'info');

    // Chuyển sang người tiếp theo
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
    this.turnNumber += 1;
    this.diceRolledThisTurn = false;
    this.devCardPlayedThisTurn = false;
    this.pendingTrade = null;
    this.phase = GAME_PHASES.TURN_ROLL;

    // Xóa toàn bộ sự kiện tạm thời của lượt vừa kết thúc để không bị lặp lại ở lượt sau
    this.lastProduction = null;
    this.lastProductionId = null;
    this.lastSpent = null;
    this.lastBankTrade = null;
    this.lastPlayerTrade = null;
    this.lastSteal = null;
    this.lastDevCardBought = null;
    this.lastDevCardPlayed = null;

    const nextP = this.getCurrentPlayer();
    this.logEvent(`Tới lượt ${nextP.name} (Lượt ${this.turnNumber}).`, 'system');

    return { success: true, nextPlayerId: nextP.id };
  }

  /**
   * Tạo bản snapshot trạng thái phù hợp và bảo mật cho từng người chơi
   */
  getPlayerView(viewerPlayerId) {
    const isGameOver = (this.phase === GAME_PHASES.GAME_OVER);

    const playersView = {};
    Object.values(this.players).forEach(p => {
      const isSelf = (p.id === viewerPlayerId);

      if (isSelf || isGameOver) {
        // Chủ sở hữu (hoặc khi đã kết thúc ván) nhìn thấy đầy đủ thẻ bài của mình
        playersView[p.id] = {
          id: p.id,
          name: p.name,
          color: p.color,
          resources: { ...p.resources },
          totalResourceCount: getTotalResourceCount(p.resources),
          pieces: { ...p.pieces },
          devCards: p.devCards.map(c => ({ id: c.id, type: c.type, turnBought: c.turnBought, isPlayed: c.isPlayed })),
          knightsPlayed: p.knightsPlayed,
          hasLongestRoad: p.hasLongestRoad,
          longestRoadLength: p.longestRoadLength,
          hasLargestArmy: p.hasLargestArmy,
          publicVictoryPoints: p.publicVictoryPoints,
          totalVictoryPoints: p.totalVictoryPoints
        };
      } else {
        // Đối thủ chỉ nhìn thấy tổng số thẻ, ẩn loại thẻ bài bí mật
        playersView[p.id] = {
          id: p.id,
          name: p.name,
          color: p.color,
          totalResourceCount: getTotalResourceCount(p.resources),
          pieces: { ...p.pieces },
          totalDevCardCount: p.devCards.filter(c => !c.isPlayed).length,
          knightsPlayed: p.knightsPlayed,
          hasLongestRoad: p.hasLongestRoad,
          longestRoadLength: p.longestRoadLength,
          hasLargestArmy: p.hasLargestArmy,
          publicVictoryPoints: p.publicVictoryPoints
        };
      }
    });

    return {
      phase: this.phase,
      turnNumber: this.turnNumber,
      currentTurnPlayerId: this.turnOrder[this.currentTurnIndex],
      turnOrder: this.turnOrder,
      dice: this.dice,
      diceRolledThisTurn: this.diceRolledThisTurn,
      board: this.board,
      bank: { ...this.bank },
      devCardsRemaining: this.devCardDeck.length,
      awards: this.awards,
      winnerId: this.winnerId,
      players: playersView,
      pendingDiscards: this.pendingDiscards,
      eligibleStealVictims: this.eligibleStealVictims.map(v => v.id),
      lastProduction: this.lastProduction,
      lastProductionId: this.lastProductionId,
      lastSpent: this.lastSpent,
      lastBankTrade: this.lastBankTrade,
      lastPlayerTrade: this.lastPlayerTrade,
      lastSteal: this.lastSteal ? {
        id: this.lastSteal.id,
        stealerId: this.lastSteal.stealerId,
        victimId: this.lastSteal.victimId,
        resource: (this.lastSteal.stealerId === viewerPlayerId || this.lastSteal.victimId === viewerPlayerId)
          ? this.lastSteal.stolenResource
          : (this.lastSteal.stolenResource || 'resource')
      } : null,
      lastDevCardBought: this.lastDevCardBought ? {
        id: this.lastDevCardBought.id,
        playerId: this.lastDevCardBought.playerId,
        cardType: (this.lastDevCardBought.playerId === viewerPlayerId) ? this.lastDevCardBought.cardType : 'dev_card'
      } : null,
      lastDevCardPlayed: this.lastDevCardPlayed,
      setupStep: this.setupStep,
      setupLastSettlementVertexId: this.setupLastSettlementVertexId,
      eventLog: this.eventLog.slice(-15)
    };
  }
}
