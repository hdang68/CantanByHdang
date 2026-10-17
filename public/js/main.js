// Main Frontend Controller - Modern 3-Column Tabletop, Drag-and-Drop & Particle Animations
import { initSocket, measurePing, emitAsync } from './socket.js';
import { SvgBoardRenderer } from './board/svgRenderer.js';
import { BoardInteractions } from './board/interactions.js';
import { sound } from './audio/soundEngine.js';
import {
  animateHarvestProduction,
  animateSpendResources,
  animateBankTrade,
  animatePlayerTrade,
  animateSteal,
  animateDevCardBuy,
  animateDevCardPlay,
  spawnFlyingItem,
  spawnFlyingChip,
  getTableCenterPos
} from './animations.js';

// Trạng thái cục bộ của Client
const state = {
  socketId: null,
  playerId: null,
  playerName: '',
  roomId: null,
  sessionToken: null,
  isHost: false,
  room: null,
  board: null,
  gameState: null,
  boardRenderer: null,
  boardInteractions: null,
  currentTradeOffer: null,
  tradeTargetPlayerId: null,
  prevTurnPlayerId: null,
  prevPhase: null,
  lastDiceHash: null,
  lastProductionHash: null,
  lastProductionId: null,
  lastSpentHash: null,
  lastSpentId: null,
  lastBankTradeId: null,
  lastPlayerTradeId: null,
  lastStealId: null,
  lastDevCardBoughtId: null,
  lastDevCardPlayedId: null,
  prevPlayersSnapshot: null,
  draggedData: null,
  cardZoomIndex: 1, // 0: small, 1: medium, 2: large
  handViewMode: localStorage.getItem('catan_hand_view_mode') || 'cards', // 'cards' | 'compact'
  cardCustomPositions: new Map() // key -> { dx, dy } vị trí kéo thả tự do của từng lá bài
};

// Phục hồi phiên trước đó từ sessionStorage ngay khi nạp trang (tránh gián đoạn khi F5)
try {
  const savedSession = sessionStorage.getItem('catan_session');
  if (savedSession) {
    const sess = JSON.parse(savedSession);
    if (sess.playerId) state.playerId = sess.playerId;
    if (sess.playerName) state.playerName = sess.playerName;
    if (sess.roomId) state.roomId = sess.roomId;
    if (sess.sessionToken) state.sessionToken = sess.sessionToken;
  }
} catch {
  sessionStorage.removeItem('catan_session');
}

const CARD_ZOOM_CLASSES = ['card-zoom-small', 'card-zoom-medium', 'card-zoom-large'];

// ========================================================
// DOM ELEMENTS SELECTORS
// ========================================================

// Header & Connectivity
const connectionPill = document.getElementById('connectionPill');
const connectionText = document.getElementById('connectionText');
const latencyValue = document.getElementById('latencyValue');
const btnPing = document.getElementById('btnPing');
const btnOpenSettingsHeader = document.getElementById('btnOpenSettingsHeader');

// Lobby & Rooms
const lobbySection = document.getElementById('lobbySection');
const joinCard = document.getElementById('joinCard');
const roomCard = document.getElementById('roomCard');
const playerNameInput = document.getElementById('playerNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');

const displayRoomId = document.getElementById('displayRoomId');
const btnCopyInvite = document.getElementById('btnCopyInvite');
const btnLeaveRoom = document.getElementById('btnLeaveRoom');
const playerCount = document.getElementById('playerCount');
const playerList = document.getElementById('playerList');
const btnStartGame = document.getElementById('btnStartGame');
const waitingNote = document.getElementById('waitingNote');
const lobbyBoardBadge = document.getElementById('lobbyBoardBadge');
const lobbyHostMapActions = document.getElementById('lobbyHostMapActions');
const toggleRandomBoard = document.getElementById('toggleRandomBoard');
const btnRerollRandomBoard = document.getElementById('btnRerollRandomBoard');

// 1. CỘT TRÁI (LEFT PANEL): 4 Người chơi & Túi thẻ
const inGameLeftPanel = document.getElementById('inGameLeftPanel');
const hudOtherPlayersBar = document.getElementById('hudOtherPlayersBar');
const viewerHandSection = document.getElementById('viewerHandSection');
const resourceCardsGrid = document.getElementById('resourceCardsGrid');
const btnToggleHandCollapse = document.getElementById('btnToggleHandCollapse');
const handToggleIcon = document.getElementById('handToggleIcon');
const handToggleLabel = document.getElementById('handToggleLabel');
const btnToggleHandViewMode = document.getElementById('btnToggleHandViewMode');
const handViewModeIcon = document.getElementById('handViewModeIcon');
const handViewModeLabel = document.getElementById('handViewModeLabel');
const compactHandView = document.getElementById('compactHandView');
const cardsHandView = document.getElementById('cardsHandView');
const individualCardsList = document.getElementById('individualCardsList');
const btnSortCards = document.getElementById('btnSortCards');
const handCardsSummaryBadge = document.getElementById('handCardsSummaryBadge');
const handHeader = document.getElementById('handHeader');
const handDevCardsList = document.getElementById('handDevCardsList');

const resWoodCount = document.getElementById('resWoodCount');
const resClayCount = document.getElementById('resClayCount');
const resSheepCount = document.getElementById('resSheepCount');
const resWheatCount = document.getElementById('resWheatCount');
const resOreCount = document.getElementById('resOreCount');
const playerVpCount = document.getElementById('playerVpCount');
const myDevCardsBadge = document.getElementById('myDevCardsBadge');

// 2. KHUNG GIỮA (CENTER STAGE): Bản đồ Pan/Zoom & Khay Kéo Quân
const inGameCenterStage = document.getElementById('inGameCenterStage');
const svgBoardContainer = document.getElementById('svgBoardContainer');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnZoomReset = document.getElementById('btnZoomReset');
const btnOpenSettingsBoard = document.getElementById('btnOpenSettingsBoard');

const buildingDock = document.getElementById('buildingDock');
const dragTokenSettlement = document.getElementById('dragTokenSettlement');
const dragTokenCity = document.getElementById('dragTokenCity');
const dragTokenRoad = document.getElementById('dragTokenRoad');
const dragTokenDevCard = document.getElementById('dragTokenDevCard');
const stockSettlements = document.getElementById('stockSettlements');
const stockCities = document.getElementById('stockCities');
const stockRoads = document.getElementById('stockRoads');
const stockDevCards = document.getElementById('stockDevCards');

const btnEndTurn = document.getElementById('btnEndTurn');
const btnOpenDevCards = document.getElementById('btnOpenDevCards');

// 3. CỘT PHẢI (RIGHT PANEL): Xúc xắc & Ngân hàng
const inGameRightPanel = document.getElementById('inGameRightPanel');
const hudDiceWidget = document.getElementById('hudDiceWidget');
const die1 = document.getElementById('die1');
const die2 = document.getElementById('die2');
const diceCube1 = document.getElementById('diceCube1');
const diceCube2 = document.getElementById('diceCube2');
const dieWrapper1 = document.getElementById('dieWrapper1');
const dieWrapper2 = document.getElementById('dieWrapper2');
const diceScoreText = document.getElementById('diceScoreText');
const diceScoreBanner = document.getElementById('diceScoreBanner');
const btnRollDice = document.getElementById('btnRollDice');
const btnRollDiceFloating = document.getElementById('btnRollDiceFloating');

const hudBankWidget = document.getElementById('hudBankWidget');
const bankStockWood = document.getElementById('bankStockWood');
const bankStockClay = document.getElementById('bankStockClay');
const bankStockSheep = document.getElementById('bankStockSheep');
const bankStockWheat = document.getElementById('bankStockWheat');
const bankStockOre = document.getElementById('bankStockOre');
const bankDevCardsRemaining = document.getElementById('bankDevCardsRemaining');
const btnBuyDevCard = document.getElementById('btnBuyDevCard');

// Nhật ký sự kiện nổi
const floatingLogDrawer = document.getElementById('floatingLogDrawer');
const logHeader = document.getElementById('logHeader');
const btnToggleLogDrawer = document.getElementById('btnToggleLogDrawer');
const logToggleIcon = document.getElementById('logToggleIcon');
const logToggleLabel = document.getElementById('logToggleLabel');
const btnClearLog = document.getElementById('btnClearLog');
const logContainer = document.getElementById('logContainer');

// Board Toolbar (Pregame only)
const boardModeBadge = document.getElementById('boardModeBadge');
const btnLoadStandard = document.getElementById('btnLoadStandard');
const btnGenerateRandom = document.getElementById('btnGenerateRandom');
const btnCycleColor = document.getElementById('btnCycleColor');
const currentColorDot = document.getElementById('currentColorDot');
const btnClearPieces = document.getElementById('btnClearPieces');

// Modal 1A: Giao dịch Ngân hàng (Dedicated 4:1 Bank Trade Modal)
const modalBankTrade = document.getElementById('modalBankTrade');
const btnCloseBankTradeModal = document.getElementById('btnCloseBankTradeModal');
const bankTradeGiveSelect = document.getElementById('bankTradeGiveSelect');
const bankTradeGetSelect = document.getElementById('bankTradeGetSelect');
const bankTradeGiveStock = document.getElementById('bankTradeGiveStock');
const bankTradeGetStock = document.getElementById('bankTradeGetStock');
const btnExecuteBankTrade = document.getElementById('btnExecuteBankTrade');

// Modal 1B: Giao dịch Cảng Biển (Dedicated Port Trade Modal - 2:1 hoặc 3:1)
const modalPortTrade = document.getElementById('modalPortTrade');
const btnClosePortTradeModal = document.getElementById('btnClosePortTradeModal');
const portTradeTitle = document.getElementById('portTradeTitle');
const portBadgeNotice = document.getElementById('portBadgeNotice');
const portTradeGiveBadge = document.getElementById('portTradeGiveBadge');
const portTradeGiveSelect = document.getElementById('portTradeGiveSelect');
const portTradeFixedGive = document.getElementById('portTradeFixedGive');
const portFixedResIcon = document.getElementById('portFixedResIcon');
const portFixedResName = document.getElementById('portFixedResName');
const portTradeGiveStock = document.getElementById('portTradeGiveStock');
const portTradeGetSelect = document.getElementById('portTradeGetSelect');
const portTradeGetStock = document.getElementById('portTradeGetStock');
const btnExecutePortTrade = document.getElementById('btnExecutePortTrade');

// Modal 1C: Giao dịch với Người chơi (Player-to-Player Trade Modal)
const modalPlayerTrade = document.getElementById('modalPlayerTrade');
const btnClosePlayerTradeModal = document.getElementById('btnClosePlayerTradeModal');
const playerTradeTargetName = document.getElementById('playerTradeTargetName');
const activeTradeStatusBox = document.getElementById('activeTradeStatusBox');
const tradeResponsesList = document.getElementById('tradeResponsesList');
const btnCancelActiveTrade = document.getElementById('btnCancelActiveTrade');
const btnSendPlayerTradeOffer = document.getElementById('btnSendPlayerTradeOffer');

// Modal 2: Trade Proposal Received
const modalTradeProposal = document.getElementById('modalTradeProposal');
const tradeProposalAuthor = document.getElementById('tradeProposalAuthor');
const tradeProposalGiveCards = document.getElementById('tradeProposalGiveCards');
const tradeProposalReceiveCards = document.getElementById('tradeProposalReceiveCards');
const btnAcceptTradeProposal = document.getElementById('btnAcceptTradeProposal');
const btnRejectTradeProposal = document.getElementById('btnRejectTradeProposal');

// Modal: Steal Resource
const modalSteal = document.getElementById('modalSteal');
const stealVictimsList = document.getElementById('stealVictimsList');

// Modal 3: Discard Resources
const modalDiscard = document.getElementById('modalDiscard');
const discardRequiredCount = document.getElementById('discardRequiredCount');
const discardCurrentCount = document.getElementById('discardCurrentCount');
const btnConfirmDiscard = document.getElementById('btnConfirmDiscard');

// Modal 4: Dev Cards
const modalDevCards = document.getElementById('modalDevCards');
const btnCloseDevCardsModal = document.getElementById('btnCloseDevCardsModal');
const myDevCardsList = document.getElementById('myDevCardsList');
const yearOfPlentySelector = document.getElementById('yearOfPlentySelector');
const yopRes1 = document.getElementById('yopRes1');
const yopRes2 = document.getElementById('yopRes2');
const btnConfirmYearOfPlenty = document.getElementById('btnConfirmYearOfPlenty');
const monopolySelector = document.getElementById('monopolySelector');
const monopolyRes = document.getElementById('monopolyRes');
const btnConfirmMonopoly = document.getElementById('btnConfirmMonopoly');

// Modal 5: Victory
const modalVictory = document.getElementById('modalVictory');
const victoryWinnerName = document.getElementById('victoryWinnerName');
const btnVictoryBackToLobby = document.getElementById('btnVictoryBackToLobby');

// Modal 6: Game Settings (Cài đặt trò chơi)
const modalSettings = document.getElementById('modalSettings');
const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
const btnSettingsMute = document.getElementById('btnSettingsMute');
const settingsVolumeSlider = document.getElementById('settingsVolumeSlider');
const settingsVolumePercent = document.getElementById('settingsVolumePercent');
const btnSettingsResetZoom = document.getElementById('btnSettingsResetZoom');
const btnSettingsLeaveGame = document.getElementById('btnSettingsLeaveGame');

// Tên và Biểu tượng của 5 loại tài nguyên
const RESOURCE_NAMES = {
  wood: 'Gỗ',
  clay: 'Đất sét',
  sheep: 'Cừu',
  wheat: 'Lúa mì',
  ore: 'Quặng'
};

const RESOURCE_ICONS = {
  wood: '🌲',
  clay: '🧱',
  sheep: '🐑',
  wheat: '🌾',
  ore: '⛰️'
};

const DEV_CARD_NAMES = {
  knight: 'Hiệp Sĩ',
  road_building: 'Xây Đường (2 đường free)',
  year_of_plenty: 'Bội Thu (Lấy 2 tài nguyên)',
  monopoly: 'Độc Quyền (Gom tài nguyên)',
  victory_point: 'Điểm Chiến Thắng (+1 VP ẩn)'
};

const DEV_CARD_ICONS = {
  knight: '⚔️',
  road_building: '🛣️',
  year_of_plenty: '🌾',
  monopoly: '💎',
  victory_point: '🏆'
};

const DEV_CARD_SHORT_NAMES = {
  knight: 'Hiệp Sĩ',
  road_building: 'Xây Đường',
  year_of_plenty: 'Bội Thu',
  monopoly: 'Độc Quyền',
  victory_point: 'Chiến Thắng'
};

// Trạng thái chọn tài nguyên giao dịch giữa người chơi
const domesticTradeState = {
  give: { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 },
  receive: { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 }
};

// Trạng thái chọn tài nguyên nộp bỏ khi ra số 7
const discardState = { wood: 0, clay: 0, sheep: 0, wheat: 0, ore: 0 };
let currentDiscardRequired = 0;

// ========================================================
// HELPER FUNCTIONS & LOGGING
// ========================================================

export function addLog(message, type = 'system') {
  const item = document.createElement('div');
  item.className = `log-item ${type}`;

  const timeStr = new Date().toTimeString().split(' ')[0];
  item.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;

  logContainer.appendChild(item);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function updateConnectionStatus(status, text) {
  connectionPill.className = `status-pill ${status}`;
  connectionText.textContent = text;
}

async function updatePing() {
  const ms = await measurePing();
  latencyValue.textContent = ms >= 0 ? ms : '--';
}

function saveSession() {
  if (state.roomId && state.sessionToken) {
    sessionStorage.setItem('catan_session', JSON.stringify({
      roomId: state.roomId,
      sessionToken: state.sessionToken,
      playerId: state.playerId,
      playerName: state.playerName
    }));
  }
}

function clearSession() {
  sessionStorage.removeItem('catan_session');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Render hoặc cập nhật bàn cờ SVG
function renderBoard(boardData) {
  state.board = boardData;
  state.boardRenderer = new SvgBoardRenderer(svgBoardContainer, boardData, {
    onVertexClick: (vertexId) => handleBoardVertexClick(vertexId),
    onEdgeClick: (edgeId) => handleBoardEdgeClick(edgeId),
    onHexClick: (hexId) => handleBoardHexClick(hexId),
    onPortClick: (port) => handleBoardPortClick(port),
    onBuildingPlaced: (type) => sound.playBuild(type),
    onRoadPlaced: () => sound.playBuild('road'),
    onRobberMoved: () => sound.playRobber(),
    onRobberClicked: () => addLog('Hãy bấm hoặc kéo Tên cướp vào một ô lục giác khác để di chuyển!', 'info')
  });
}

// ========================================================
// XỬ LÝ HÀNH ĐỘNG CLICK & DROP TRÊN BÀN CỜ SVG
// (Hạn chế Click để đặt / đổi - Bắt buộc dùng Kéo Thả)
// ========================================================

function handleBoardVertexClick(vertexId) {
  if (!state.gameState || state.gameState.phase === 'GAME_OVER') return;
  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  if (!isMyTurn) return;

  const phase = state.gameState.phase;
  // Cho phép Click trực tiếp để đặt Khu định cư trong giai đoạn khởi đầu
  if (phase === 'SETUP_ROUND_1' || phase === 'SETUP_ROUND_2') {
    if (state.gameState.setupStep === 'SETTLEMENT') {
      executePlaceSettlement(vertexId);
    }
  }
}

function handleBoardEdgeClick(edgeId) {
  if (!state.gameState || state.gameState.phase === 'GAME_OVER') return;
  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  if (!isMyTurn) return;

  const phase = state.gameState.phase;
  // Cho phép Click trực tiếp để đặt Đường trong giai đoạn khởi đầu
  if (phase === 'SETUP_ROUND_1' || phase === 'SETUP_ROUND_2') {
    if (state.gameState.setupStep === 'ROAD') {
      executePlaceRoad(edgeId);
    }
  }
}

function handleBoardPortClick(port) {
  // Silent - Bắt buộc kéo thả tài nguyên vào Cảng, không cần thông báo hướng dẫn
}

// Thực hiện đặt Khu định cư khi người chơi KÉO THẢ từ Dock vào Đỉnh
async function executePlaceSettlement(vertexId) {
  if (!state.gameState || state.gameState.phase === 'GAME_OVER') return;

  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  const phase = state.gameState.phase;
  if (!isMyTurn) return;

  // Giai đoạn thiết lập (Opening): Đặt Khu định cư Miễn phí
  if (phase === 'SETUP_ROUND_1' || phase === 'SETUP_ROUND_2') {
    if (state.gameState.setupStep === 'ROAD') {
      addLog('Bạn đã đặt Khu định cư cho vòng này rồi, hãy kéo Đường nối vào!', 'warning');
      return;
    }
    try {
      const res = await emitAsync('game:setup_settlement', { vertexId });
      if (!res.success && res.error) {
        addLog(res.error, 'error');
      }
    } catch (err) {
      addLog(err.message, 'error');
    }
    return;
  }

  // Giai đoạn chính (Main Phase): Xây Khu định cư
  if (phase === 'TURN_MAIN') {
    try {
      const res = await emitAsync('game:build_settlement', { vertexId });
      if (!res.success && res.error) addLog(res.error, 'error');
    } catch (err) {
      addLog(err.message, 'error');
    }
  }
}

// Thực hiện nâng cấp Thành phố khi người chơi KÉO THẢ từ Dock vào Khu định cư
async function executePlaceCity(vertexId) {
  if (!state.gameState || state.gameState.phase === 'GAME_OVER') return;

  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  const phase = state.gameState.phase;
  if (!isMyTurn || phase !== 'TURN_MAIN') return;

  try {
    const res = await emitAsync('game:build_city', { vertexId });
    if (!res.success && res.error) addLog(res.error, 'error');
  } catch (err) {
    addLog(err.message, 'error');
  }
}

// Thực hiện đặt Đường khi người chơi KÉO THẢ từ Dock vào Cạnh
async function executePlaceRoad(edgeId) {
  if (!state.gameState || state.gameState.phase === 'GAME_OVER') return;

  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  const phase = state.gameState.phase;
  if (!isMyTurn) return;

  // Giai đoạn thiết lập (Opening): Đặt Đường Miễn phí
  if (phase === 'SETUP_ROUND_1' || phase === 'SETUP_ROUND_2') {
    if (state.gameState.setupStep === 'SETTLEMENT') {
      addLog('Hãy đặt Khu định cư trước rồi kéo Đường nối vào!', 'warning');
      return;
    }
    try {
      const res = await emitAsync('game:setup_road', { edgeId });
      if (!res.success && res.error) {
        addLog(res.error, 'error');
      }
    } catch (err) {
      addLog(err.message, 'error');
    }
    return;
  }

  // Giai đoạn chính (Main Phase): Xây Đường (1 Wood, 1 Clay)
  if (phase === 'TURN_MAIN') {
    try {
      const res = await emitAsync('game:build_road', { edgeId });
      if (!res.success && res.error) addLog(res.error, 'error');
    } catch (err) {
      addLog(err.message, 'error');
    }
  }
}

async function handleBoardHexClick(hexId) {
  if (!state.gameState) return;

  const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
  const phase = state.gameState.phase;

  // Di chuyển Tên cướp
  if (phase === 'TURN_ROBBER_MOVE' && isMyTurn) {
    const currentRobberHex = state.board?.robberHexId || state.gameState?.board?.robberHexId;
    if (currentRobberHex === hexId) {
      addLog('Tên cướp bắt buộc phải được chuyển sang một ô địa hình khác!', 'warning');
      return;
    }
    try {
      const res = await emitAsync('game:move_robber', { hexId });
      if (!res.success) {
        addLog(res.error || 'Không thể di chuyển Tên cướp đến ô này.', 'error');
      } else if (res.mustSteal && res.victims && res.victims.length > 0) {
        openStealModal(res.victims);
      }
    } catch (err) {
      addLog(err.message, 'error');
    }
    return;
  }

  // Nếu người chơi bấm vào ô khi đang chờ bỏ bài ra 7
  if (phase === 'TURN_ROBBER_DISCARD' && isMyTurn) {
    const pendingNames = Object.keys(state.gameState.pendingDiscards || {})
      .map(pId => state.gameState.players[pId]?.name || 'Đối thủ')
      .join(', ');
    addLog(`Chưa thể di chuyển Tên cướp: Vui lòng đợi [${pendingNames}] hoàn tất bỏ bài ra 7!`, 'warning');
    return;
  }
}

function openStealModal(victims) {
  if (!modalSteal || !stealVictimsList) return;
  if (!victims || victims.length === 0) {
    modalSteal.classList.add('hidden');
    return;
  }

  // Nếu chỉ có đúng 1 nạn nhân hợp lệ, tự động cướp luôn để không tốn thao tác
  if (victims.length === 1) {
    emitAsync('game:steal', { targetPlayerId: victims[0].id })
      .then(res => {
        if (!res.success && res.error) addLog(res.error, 'error');
      })
      .catch(e => addLog(e.message, 'error'));
    modalSteal.classList.add('hidden');
    return;
  }

  stealVictimsList.innerHTML = '';
  victims.forEach(v => {
    const item = document.createElement('div');
    item.className = 'steal-victim-item';
    const colorHex = (typeof v.color === 'string' ? v.color : v.color?.hex) || '#e74c3c';
    const cardText = v.totalResourceCount !== undefined ? `${v.totalResourceCount} thẻ trên tay` : 'Có tài nguyên';

    item.innerHTML = `
      <div class="victim-badge" style="background-color: ${escapeHtml(colorHex)}"></div>
      <div class="victim-info">
        <span class="victim-name">${escapeHtml(v.name)}</span>
        <span class="victim-cards">${escapeHtml(cardText)}</span>
      </div>
      <button class="btn btn-sm btn-primary btn-steal-target">Cướp thẻ</button>
    `;

    item.addEventListener('click', async () => {
      modalSteal.classList.add('hidden');
      try {
        const res = await emitAsync('game:steal', { targetPlayerId: v.id });
        if (!res.success && res.error) addLog(res.error, 'error');
      } catch (err) {
        addLog(err.message, 'error');
      }
    });

    stealVictimsList.appendChild(item);
  });

  modalSteal.classList.remove('hidden');
}

// ========================================================
// CẬP NHẬT GIAO DIỆN BÀN CHƠI FULLSCREEN (IN-BOARD HUD)
// ========================================================

const PHASE_TITLES = {
  SETUP_ROUND_1: 'Đặt công trình 1 (Xuôi)',
  SETUP_ROUND_2: 'Đặt công trình 2 (Ngược)',
  TURN_ROLL: 'Chờ gieo xúc xắc',
  TURN_ROBBER_DISCARD: 'Bỏ bài ra 7',
  TURN_ROBBER_MOVE: 'Di chuyển Tên cướp',
  TURN_ROBBER_STEAL: 'Cướp tài nguyên',
  TURN_MAIN: 'Lượt chính (Xây & Đổi)',
  GAME_OVER: 'KẾT THÚC VÁN'
};

function updateGameHud(gameState) {
  state.gameState = gameState;

  // Bật chế độ Fullscreen Table Mode
  document.body.classList.add('in-game-mode');
  lobbySection.classList.add('hidden');

  // Tự động nhận diện state.playerId nếu chưa có hoặc sau khi F5:
  // Trong view từ getPlayerView(), chỉ duy nhất người chơi hiện tại sở hữu đối tượng resources đầy đủ
  if (!state.playerId || !gameState.players[state.playerId]) {
    const selfPlayer = Object.values(gameState.players || {}).find(p => p && p.resources && typeof p.resources === 'object');
    if (selfPlayer) {
      state.playerId = selfPlayer.id;
      if (selfPlayer.name) state.playerName = selfPlayer.name;
      saveSession();
    }
  }

  const activePlayer = gameState.players[gameState.currentTurnPlayerId];
  const isMyTurn = (gameState.currentTurnPlayerId === state.playerId);

  // Phát âm thanh nhẹ khi tới lượt của người chơi
  if (isMyTurn && state.prevTurnPlayerId !== state.playerId) {
    sound.playTurnNotification();
  }
  state.prevTurnPlayerId = gameState.currentTurnPlayerId;

  // 1. Cột trái: Render 4 Người chơi
  renderLeftPlayersPanel(gameState);

  // 2. Xúc xắc 3D nổi bên phải (Catan 3D CSS Cubes)
  if (gameState.dice && gameState.dice.length === 2) {
    die1.textContent = gameState.dice[0];
    die2.textContent = gameState.dice[1];

    const diceHash = `${gameState.dice[0]}_${gameState.dice[1]}_${gameState.turnNumber}`;
    const isNewRoll = (state.lastDiceHash !== diceHash);

    if (isNewRoll && (gameState.phase === 'TURN_MAIN' || gameState.phase.startsWith('TURN_ROBBER_'))) {
      state.lastDiceHash = diceHash;
      const sum = gameState.dice[0] + gameState.dice[1];

      // Kích hoạt hoạt ảnh xoay 3D chân thực và âm thanh lắc
      render3DDiceResult(gameState.dice[0], gameState.dice[1], true);

      // Chờ xúc xắc 3D hoàn tất quay và dừng hẳn (1180ms) rồi mới kích hoạt rung tên cướp hoặc nảy thẻ số
      setTimeout(() => {
        if (sum === 7) {
          state.boardRenderer?.shakeRobber();
          sound.playRobber();
        } else {
          state.boardRenderer?.setRobberGlowing(false);
          state.boardRenderer?.bounceNumberTokens(sum);
        }
      }, 1180);
    } else if (!state.lastDiceHash) {
      // Đặt góc tĩnh 3D khi vừa vào bàn cờ hoặc reconnect mà không cần lắc
      state.lastDiceHash = diceHash;
      render3DDiceResult(gameState.dice[0], gameState.dice[1], false);
    }
  }

  // Duy trì hào quang phát sáng nhẹ cho Tên cướp trong suốt giai đoạn cướp bóc
  const isRobberPhase = Boolean(gameState.phase && gameState.phase.startsWith('TURN_ROBBER_'));
  const canMoveRobber = isMyTurn && (gameState.phase === 'TURN_ROBBER_MOVE');

  if (isRobberPhase) {
    if (isNewRoll) {
      setTimeout(() => {
        state.boardRenderer?.setRobberGlowing(true);
        state.boardRenderer?.setRobberInteractive(canMoveRobber);
        state.boardRenderer?.setRobberTargetHighlight(canMoveRobber);
      }, 1180);
    } else {
      state.boardRenderer?.setRobberGlowing(true);
      state.boardRenderer?.setRobberInteractive(canMoveRobber);
      state.boardRenderer?.setRobberTargetHighlight(canMoveRobber);
    }
  } else if (gameState.phase === 'TURN_MAIN' || gameState.phase === 'TURN_ROLL') {
    state.boardRenderer?.setRobberGlowing(false);
    state.boardRenderer?.setRobberInteractive(false);
    state.boardRenderer?.setRobberTargetHighlight(false);
  }

  // Cập nhật thông điệp trạng thái lượt trên Widget xúc xắc
  if (diceScoreText) {
    if (gameState.phase === 'TURN_ROBBER_DISCARD') {
      const req = gameState.pendingDiscards?.[state.playerId];
      if (req && req > 0) {
        diceScoreText.innerHTML = `⚠️ Ra 7: Bạn cần bỏ ${req} thẻ!`;
      } else {
        const pendingNames = Object.keys(gameState.pendingDiscards || {})
          .map(pId => gameState.players[pId]?.name || 'Đối thủ')
          .join(', ');
        diceScoreText.innerHTML = `⏳ Đang chờ [${pendingNames}] bỏ bài...`;
      }
    } else if (gameState.phase === 'TURN_ROBBER_MOVE') {
      diceScoreText.innerHTML = isMyTurn
        ? '🗡️ Lượt bạn: Hãy chọn/kéo Tên cướp!'
        : `🗡️ ${activePlayer?.name || 'Đối thủ'} đang di chuyển Tên cướp...`;
    } else if (gameState.phase === 'TURN_ROBBER_STEAL') {
      diceScoreText.innerHTML = isMyTurn
        ? '🗡️ Lượt bạn: Chọn đối thủ để cướp!'
        : `🗡️ ${activePlayer?.name || 'Đối thủ'} đang cướp tài nguyên...`;
    }
  }

  const canRoll = isMyTurn && (gameState.phase === 'TURN_ROLL');
  btnRollDice.disabled = !canRoll;

  // 3. Tài nguyên cá nhân của người chơi (Túi thẻ)
  const myData = gameState.players[state.playerId];
  if (myData && myData.resources) {
    resWoodCount.textContent = myData.resources.wood || 0;
    resClayCount.textContent = myData.resources.clay || 0;
    resSheepCount.textContent = myData.resources.sheep || 0;
    resWheatCount.textContent = myData.resources.wheat || 0;
    resOreCount.textContent = myData.resources.ore || 0;
    playerVpCount.textContent = myData.totalVictoryPoints || 0;

    const unplayedDevCardsCount = myData.devCards?.filter(c => !c.isPlayed).length || 0;
    myDevCardsBadge.textContent = unplayedDevCardsCount;

    // Cập nhật nhãn tổng thẻ trên thanh header (khi thu gọn)
    const totalResCount = Object.values(myData.resources || {}).reduce((a, b) => a + (b || 0), 0);
    if (handCardsSummaryBadge) {
      handCardsSummaryBadge.textContent = `${totalResCount} thẻ${unplayedDevCardsCount > 0 ? ` + ${unplayedDevCardsCount}🃏` : ''}`;
    }

    // Render thẻ phát triển dạng chip có thể kéo thả
    renderHandDevCards(myData.devCards || [], isMyTurn, gameState.phase);

    // Render danh sách từng lá bài kéo thả trong chế độ thẻ bài
    renderIndividualCards(myData, isMyTurn, gameState.phase);
  }

  // 4. Cột phải: Ngân hàng Catan
  if (gameState.bank) {
    bankStockWood.textContent = gameState.bank.wood ?? 19;
    bankStockClay.textContent = gameState.bank.clay ?? 19;
    bankStockSheep.textContent = gameState.bank.sheep ?? 19;
    bankStockWheat.textContent = gameState.bank.wheat ?? 19;
    bankStockOre.textContent = gameState.bank.ore ?? 19;
  }
  if (gameState.devCardsRemaining !== undefined) {
    bankDevCardsRemaining.textContent = gameState.devCardsRemaining;
  }

  // 5. Khay Kéo Quân Cờ (Building Dock)
  // Quy tắc nghiêm ngặt: Tài sản không đủ thì không cho kéo thả các mặt hàng
  if (myData && myData.pieces) {
    stockSettlements.textContent = myData.pieces.settlementsRemaining;
    stockCities.textContent = myData.pieces.citiesRemaining;
    stockRoads.textContent = myData.pieces.roadsRemaining;

    const isSetup = gameState.phase.startsWith('SETUP_');
    const isMain = gameState.phase === 'TURN_MAIN';
    const myRes = myData.resources || {};
    const pieces = myData.pieces || {};

    const canAffordRoad = (myRes.wood >= 1 && myRes.clay >= 1);
    const canAffordSettlement = (myRes.wood >= 1 && myRes.clay >= 1 && myRes.sheep >= 1 && myRes.wheat >= 1);
    const canAffordCity = (myRes.wheat >= 2 && myRes.ore >= 3);
    const canAffordDev = (myRes.sheep >= 1 && myRes.wheat >= 1 && myRes.ore >= 1);

    let canDragRoad = false;
    let canDragSettlement = false;
    let canDragCity = false;
    let canDragDev = false;

    let roadTitle = 'Đường';
    let settlementTitle = 'Khu định cư';
    let cityTitle = 'Thành phố';
    let devTitle = 'Thẻ phát triển';

    if (!isMyTurn) {
      const waitMsg = 'Chưa tới lượt của bạn';
      roadTitle = settlementTitle = cityTitle = devTitle = waitMsg;
    } else if (isSetup) {
      // GIAI ĐOẠN KHỞI TẠO (OPENING): NHÀ VÀ ĐƯỜNG MIỄN PHÍ THEO THỨ TỰ (SETTLEMENT -> ROAD)
      const currentStep = gameState.setupStep || 'SETTLEMENT';
      if (currentStep === 'SETTLEMENT') {
        canDragSettlement = (pieces.settlementsRemaining > 0);
        canDragRoad = false;
        settlementTitle = 'Giai đoạn khởi đầu: Kéo thả đặt Khu định cư (FREE)';
        roadTitle = 'Hãy đặt Khu định cư trước!';
      } else {
        canDragSettlement = false;
        canDragRoad = (pieces.roadsRemaining > 0);
        settlementTitle = 'Đã đặt xong Khu định cư vòng này';
        roadTitle = 'Giai đoạn khởi đầu: Kéo thả đặt Đường nối vào Khu định cư vừa xây (FREE)';
      }

      cityTitle = 'Chưa khả dụng';
      devTitle = 'Chưa khả dụng';
    } else if (isMain) {
      if (pieces.roadsRemaining <= 0) roadTitle = 'Đã dùng hết 15 con đường';
      else if (!canAffordRoad) roadTitle = 'Không đủ tài nguyên xây đường';
      else canDragRoad = true;

      if (pieces.settlementsRemaining <= 0) settlementTitle = 'Đã dùng hết 5 Khu định cư';
      else if (!canAffordSettlement) settlementTitle = 'Không đủ tài nguyên xây Khu định cư';
      else canDragSettlement = true;

      if (pieces.citiesRemaining <= 0) cityTitle = 'Đã dùng hết 4 Thành phố';
      else if (!canAffordCity) cityTitle = 'Không đủ tài nguyên nâng cấp Thành phố';
      else canDragCity = true;

      if ((gameState.devCardsRemaining ?? 25) <= 0) devTitle = 'Đã hết Thẻ phát triển trong ngân hàng';
      else if (!canAffordDev) devTitle = 'Không đủ tài nguyên mua Thẻ phát triển';
      else canDragDev = true;
    } else {
      const waitMsg = 'Chưa tới giai đoạn xây dựng';
      roadTitle = settlementTitle = cityTitle = devTitle = waitMsg;
    }

    dragTokenSettlement.draggable = canDragSettlement;
    dragTokenSettlement.classList.toggle('disabled-dock-item', !canDragSettlement);
    dragTokenSettlement.classList.toggle('free-opening-token', isSetup && canDragSettlement);
    dragTokenSettlement.setAttribute('title', settlementTitle);

    dragTokenRoad.draggable = canDragRoad;
    dragTokenRoad.classList.toggle('disabled-dock-item', !canDragRoad);
    dragTokenRoad.classList.toggle('free-opening-token', isSetup && canDragRoad);
    dragTokenRoad.setAttribute('title', roadTitle);

    dragTokenCity.draggable = canDragCity;
    dragTokenCity.classList.toggle('disabled-dock-item', !canDragCity);
    dragTokenCity.setAttribute('title', cityTitle);

    if (dragTokenDevCard) {
      dragTokenDevCard.draggable = canDragDev;
      dragTokenDevCard.classList.toggle('disabled-dock-item', !canDragDev);
      dragTokenDevCard.setAttribute('title', devTitle);
      if (stockDevCards) {
        stockDevCards.textContent = gameState.devCardsRemaining ?? 25;
      }
    }

    // Nhãn chi phí để nguyên như cũ:
    const costSettlement = document.getElementById('costSettlement');
    const costRoad = document.getElementById('costRoad');
    const pillFreeSettlement = document.getElementById('pillFreeSettlement');
    const pillFreeRoad = document.getElementById('pillFreeRoad');

    if (costSettlement) {
      costSettlement.textContent = '🌲 🧱 🐑 🌾';
      costSettlement.classList.remove('free-cost');
    }
    if (costRoad) {
      costRoad.textContent = '🌲 🧱';
      costRoad.classList.remove('free-cost');
    }

    // Giữ huy hiệu FREE trên quân cờ trong giai đoạn khởi đầu
    if (isSetup) {
      pillFreeSettlement?.classList.toggle('hidden', !canDragSettlement);
      pillFreeRoad?.classList.toggle('hidden', !canDragRoad);
    } else {
      pillFreeSettlement?.classList.add('hidden');
      pillFreeRoad?.classList.add('hidden');
    }
  }

  // 6. Các nút hành động
  const canEndTurn = Boolean(isMyTurn && gameState.phase === 'TURN_MAIN');
  btnEndTurn.disabled = !canEndTurn;
  btnEndTurn.classList.toggle('disabled', !canEndTurn);

  if (!isMyTurn) {
    btnEndTurn.title = 'Đang chờ tới lượt của đối thủ...';
  } else if (gameState.phase === 'TURN_ROLL') {
    btnEndTurn.title = 'Bạn cần gieo xúc xắc trước khi kết thúc lượt.';
  } else if (gameState.phase?.startsWith('TURN_ROBBER_')) {
    btnEndTurn.title = 'Bạn cần xử lý Tên cướp trước khi kết thúc lượt.';
  } else if (gameState.phase?.startsWith('SETUP_')) {
    btnEndTurn.title = 'Đang trong giai đoạn khởi đầu bàn cờ.';
  } else {
    btnEndTurn.title = 'Bấm để kết thúc lượt của bạn.';
  }

  if (btnBuyDevCard) {
    btnBuyDevCard.disabled = !(isMyTurn && gameState.phase === 'TURN_MAIN');
  }

  // 7. Tất cả các tab khác cũng đổi màu & nhấp nháy theo người chơi đang có lượt
  const currentTurnId = gameState?.currentTurnPlayerId;
  const activeTurnPlayer = currentTurnId ? gameState?.players?.[currentTurnId] : null;
  const currentTurnColor = activeTurnPlayer?.color?.hex || '#3498db';

  const allFloatingTabs = [
    viewerHandSection,
    buildingDock,
    hudDiceWidget,
    hudBankWidget,
    floatingLogDrawer
  ];

  allFloatingTabs.forEach(tab => {
    if (tab) {
      if (currentTurnId) {
        tab.style.setProperty('--current-turn-color', currentTurnColor);
        tab.classList.add('turn-in-progress');
      } else {
        tab.classList.remove('turn-in-progress');
      }
      if (isMyTurn) {
        tab.classList.add('my-turn-active');
      } else {
        tab.classList.remove('my-turn-active');
      }
    }
  });

  // 8. Đồng bộ bàn cờ SVG (hoặc tái tạo bàn cờ nếu cấu hình Hex khác biệt ví dụ Random Board)
  if (gameState.board) {
    const currentHex0 = state.board?.hexes?.[Object.keys(state.board?.hexes || {})[0]];
    const newHex0 = gameState.board?.hexes?.[Object.keys(gameState.board?.hexes || {})[0]];
    const hexLayoutMismatch = (!state.board || !currentHex0 || !newHex0 || currentHex0.terrain !== newHex0.terrain || currentHex0.diceNumber !== newHex0.diceNumber);

    if (!state.boardRenderer || hexLayoutMismatch) {
      renderBoard(gameState.board);
    } else {
      state.boardRenderer.syncBoard(gameState.board);
    }
  }

  // 9. Kích hoạt hiệu ứng tài nguyên bay
  triggerParticleAnimations(gameState);

  // 10. Modal bỏ thẻ khi ra 7
  if (gameState.phase === 'TURN_ROBBER_DISCARD') {
    const req = gameState.pendingDiscards?.[state.playerId];
    if (req && req > 0) {
      // Chờ xúc xắc dừng hẳn (1350ms) rồi mới hiện popup bỏ thẻ để kịp nhìn xúc xắc ra 7
      if (isNewRoll) {
        setTimeout(() => {
          if (state.gameState?.phase === 'TURN_ROBBER_DISCARD') {
            openDiscardModal(req, myData?.resources || {});
          }
        }, 1350);
      } else {
        openDiscardModal(req, myData?.resources || {});
      }
    } else {
      modalDiscard.classList.add('hidden');
    }
  } else {
    modalDiscard.classList.add('hidden');
  }

  // 10B. Modal Cướp tài nguyên (TURN_ROBBER_STEAL)
  if (gameState.phase === 'TURN_ROBBER_STEAL') {
    if (isMyTurn) {
      const rawVictims = gameState.eligibleStealVictims || [];
      if (rawVictims.length > 0) {
        const fullVictims = rawVictims.map(v => typeof v === 'object' ? v : (gameState.players[v] || { id: v, name: 'Người chơi' }));
        openStealModal(fullVictims);
      } else {
        modalSteal?.classList.add('hidden');
      }
    } else {
      modalSteal?.classList.add('hidden');
    }
  } else {
    modalSteal?.classList.add('hidden');
  }

  // 11. Modal Chiến thắng
  if (gameState.phase === 'GAME_OVER' && gameState.winnerId) {
    if (state.prevPhase !== 'GAME_OVER') {
      sound.playVictory();
    }
    const winner = gameState.players[gameState.winnerId];
    victoryWinnerName.textContent = winner ? winner.name : 'Người chiến thắng';
    modalVictory.classList.remove('hidden');
  }
  state.prevPhase = gameState.phase;

  // 12. Cập nhật tỷ lệ đổi ngân hàng hoặc cảng nếu modal đang mở
  if (modalBankTrade && !modalBankTrade.classList.contains('hidden')) {
    updateBankTradeInfo();
  }
  if (modalPortTrade && !modalPortTrade.classList.contains('hidden')) {
    updatePortTradeInfo();
  }
}

// Helper lấy element đại diện cho người chơi trên giao diện
function getPlayerDomElement(playerId) {
  return document.querySelector(`.player-panel-card[data-player-id="${playerId}"]`);
}

// Helper lấy element đại diện cho ô tài nguyên ngân hàng
function getBankStackDomElement(resourceType) {
  return document.querySelector(`.bank-stack-item[data-res="${resourceType}"]`) || hudBankWidget;
}

// Helper lấy tọa độ xuất phát khi mua thẻ phát triển
function getDevDeckCenterPos() {
  const el = document.getElementById('dragTokenDevCard') || document.getElementById('stockDevCards') || hudBankWidget;
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth - 80, y: window.innerHeight / 2 };
}

// Helper chụp snapshot trạng thái tài nguyên và thẻ phát triển của tất cả người chơi
function capturePlayersSnapshot(players) {
  if (!players) return null;
  const snapshot = {};
  Object.entries(players).forEach(([pId, p]) => {
    snapshot[pId] = {
      resources: p.resources ? { ...p.resources } : null,
      totalResourceCount: p.totalResourceCount || 0,
      devCardCount: p.devCards ? (p.devCards.filter(c => !c.isPlayed).length) : (p.totalDevCardCount || 0)
    };
  });
  return snapshot;
}

// Kích hoạt hoạt ảnh: Bất kì tài nguyên hoặc thẻ bài nào thay đổi:
// Gốc -> Phóng to (Zoom large) ra giữa bàn -> Thu nhỏ dần đến đích
function triggerParticleAnimations(gameState) {
  if (!gameState) return;

  let handledAnyExplicitEvent = false;

  // A. Hoạt ảnh thu hoạch tài nguyên: Đợi xúc xắc 3D tiếp đất (1180ms) + thẻ số nảy nhẹ (450ms) rồi tài nguyên mới bay
  if (gameState.lastProduction && gameState.lastProduction.length > 0 && gameState.lastProductionId) {
    if (state.lastProductionId !== gameState.lastProductionId) {
      state.lastProductionId = gameState.lastProductionId;
      handledAnyExplicitEvent = true;
      setTimeout(() => {
        // Thu thập danh sách tài nguyên và phát âm thanh tương ứng (tiếng cừu, gỗ, quặng đá, lúa mì, đất sét)
        const producedTypes = gameState.lastProduction.map(p => p.resource);
        sound.playResourcesStaggered(producedTypes, 220);

        animateHarvestProduction(
          gameState.lastProduction,
          (hexId) => state.boardRenderer?.getHexScreenCenter(hexId),
          getPlayerDomElement
        );
      }, 1680);
    }
  }

  // B. Hoạt ảnh chi trả chi phí xây dựng: Người chơi -> Giữa bàn Zoom lớn -> Ngân hàng
  if (gameState.lastSpent && gameState.lastSpent.cost && gameState.lastSpent.id) {
    if (state.lastSpentId !== gameState.lastSpent.id) {
      state.lastSpentId = gameState.lastSpent.id;
      handledAnyExplicitEvent = true;
      sound.play('coin-fall');
      animateSpendResources(
        gameState.lastSpent.cost,
        getPlayerDomElement,
        gameState.lastSpent.playerId,
        getBankStackDomElement
      );
    }
  }

  // C. Hoạt ảnh mua Thẻ phát triển: Khay thẻ -> Giữa bàn Zoom lớn (🃏) -> Người chơi
  if (gameState.lastDevCardBought && gameState.lastDevCardBought.id) {
    if (state.lastDevCardBoughtId !== gameState.lastDevCardBought.id) {
      state.lastDevCardBoughtId = gameState.lastDevCardBought.id;
      handledAnyExplicitEvent = true;
      sound.playCardDraw();
      animateDevCardBuy(
        gameState.lastDevCardBought.playerId,
        gameState.lastDevCardBought.cardType,
        getDevDeckCenterPos,
        getPlayerDomElement
      );
    }
  }

  // D. Hoạt ảnh giao dịch Ngân hàng / Cảng:
  // - Đưa tài nguyên: Người chơi -> Giữa bàn Zoom lớn -> Ngân hàng
  // - Nhận tài nguyên: Ngân hàng -> Giữa bàn Zoom lớn -> Người chơi
  if (gameState.lastBankTrade && gameState.lastBankTrade.id) {
    if (state.lastBankTradeId !== gameState.lastBankTrade.id) {
      state.lastBankTradeId = gameState.lastBankTrade.id;
      handledAnyExplicitEvent = true;
      sound.playTrade();
      if (gameState.lastBankTrade.getResource) {
        sound.playResource(gameState.lastBankTrade.getResource, 300);
      }
      animateBankTrade(
        gameState.lastBankTrade.playerId,
        gameState.lastBankTrade.giveResource,
        gameState.lastBankTrade.giveCount,
        gameState.lastBankTrade.getResource,
        gameState.lastBankTrade.getCount,
        getPlayerDomElement,
        getBankStackDomElement
      );
    }
  }

  // E. Hoạt ảnh giao dịch trực tiếp giữa 2 người chơi:
  // Player A chuyển sang Player B & Player B chuyển sang Player A (qua giữa bàn Zoom lớn)
  if (gameState.lastPlayerTrade && gameState.lastPlayerTrade.id) {
    if (state.lastPlayerTradeId !== gameState.lastPlayerTrade.id) {
      state.lastPlayerTradeId = gameState.lastPlayerTrade.id;
      handledAnyExplicitEvent = true;
      sound.playTrade();
      animatePlayerTrade(
        gameState.lastPlayerTrade.playerAId,
        gameState.lastPlayerTrade.playerBId,
        gameState.lastPlayerTrade.give,
        gameState.lastPlayerTrade.receive,
        getPlayerDomElement
      );
    }
  }

  // F. Hoạt ảnh cướp tài nguyên: Nạn nhân -> Giữa bàn Zoom lớn -> Tên cướp
  if (gameState.lastSteal && gameState.lastSteal.id) {
    if (state.lastStealId !== gameState.lastSteal.id) {
      state.lastStealId = gameState.lastSteal.id;
      handledAnyExplicitEvent = true;
      sound.playRobber();
      animateSteal(
        gameState.lastSteal.stealerId,
        gameState.lastSteal.victimId,
        gameState.lastSteal.resource,
        getPlayerDomElement
      );
    }
  }

  // G. Hoạt ảnh đánh Thẻ phát triển (Knight, Year of Plenty, Monopoly)
  if (gameState.lastDevCardPlayed && gameState.lastDevCardPlayed.id) {
    if (state.lastDevCardPlayedId !== gameState.lastDevCardPlayed.id) {
      state.lastDevCardPlayedId = gameState.lastDevCardPlayed.id;
      handledAnyExplicitEvent = true;
      const { playerId, cardType, res1, res2, targetResource } = gameState.lastDevCardPlayed;

      if (cardType === 'knight') {
        sound.playCardPlay('knight');
      } else {
        sound.playCardPlay(cardType);
      }

      // Bay thẻ bài ra giữa bàn và phóng to
      animateDevCardPlay(playerId, cardType, getPlayerDomElement);

      if (cardType === 'year_of_plenty') {
        // 2 tài nguyên bay từ Ngân hàng -> Giữa bàn -> Người chơi
        setTimeout(() => {
          if (res1) {
            animateBankTrade(playerId, null, 0, res1, 1, getPlayerDomElement, getBankStackDomElement);
          }
          if (res2) {
            animateBankTrade(playerId, null, 0, res2, 1, getPlayerDomElement, getBankStackDomElement);
          }
        }, 300);
      } else if (cardType === 'monopoly' && targetResource) {
        // Tài nguyên bay từ tất cả đối thủ -> Giữa bàn -> Người chơi
        setTimeout(() => {
          const opponents = Object.keys(gameState.players).filter(pId => pId !== playerId);
          opponents.forEach((opId, idx) => {
            const opEl = getPlayerDomElement(opId);
            const pEl = getPlayerDomElement(playerId);
            if (opEl && pEl) {
              const opPos = { x: opEl.getBoundingClientRect().left + opEl.getBoundingClientRect().width / 2, y: opEl.getBoundingClientRect().top + opEl.getBoundingClientRect().height / 2 };
              const pPos = { x: pEl.getBoundingClientRect().left + pEl.getBoundingClientRect().width / 2, y: pEl.getBoundingClientRect().top + pEl.getBoundingClientRect().height / 2 };
              spawnFlyingItem(targetResource, opPos, pPos, {
                delay: idx * 120,
                onComplete: () => {
                  pEl.classList.remove('pulse-receive');
                  void pEl.offsetWidth;
                  pEl.classList.add('pulse-receive');
                }
              });
            }
          });
        }, 300);
      }
    }
  }

  // H. UNIVERSAL STATE DIFF FALLBACK:
  // Nếu có bất kì thay đổi tài nguyên hoặc thẻ bài nào không nằm trong các sự kiện tường minh phía trên,
  // hệ thống so khớp delta và kích hoạt ngay hoạt ảnh bay (Gốc -> Giữa bàn Zoom lớn -> Đích)!
  if (!handledAnyExplicitEvent && state.prevPlayersSnapshot && gameState.players) {
    processUniversalResourceDiffs(state.prevPlayersSnapshot, gameState.players);
  }

  // Cập nhật snapshot cho lần render kế tiếp
  state.prevPlayersSnapshot = capturePlayersSnapshot(gameState.players);
}

// Xử lý delta tài nguyên & thẻ bài dự phòng để đảm bảo 100% mọi thay đổi đều có hoạt ảnh
function processUniversalResourceDiffs(prevSnapshot, currentPlayers) {
  let animDelay = 0;

  Object.entries(currentPlayers).forEach(([pId, currentP]) => {
    const prevP = prevSnapshot[pId];
    if (!prevP) return;

    const playerEl = getPlayerDomElement(pId);
    if (!playerEl) return;
    const pRect = playerEl.getBoundingClientRect();
    const playerPos = { x: pRect.left + pRect.width / 2, y: pRect.top + pRect.height / 2 };

    // 1. So khớp thẻ phát triển nếu tăng
    const currDevCount = currentP.devCards
      ? currentP.devCards.filter(c => !c.isPlayed).length
      : (currentP.totalDevCardCount || 0);
    const prevDevCount = prevP.devCardCount || 0;

    if (currDevCount > prevDevCount) {
      const addedDevs = currDevCount - prevDevCount;
      const devDeckPos = getDevDeckCenterPos();
      for (let i = 0; i < addedDevs; i++) {
        spawnFlyingItem('dev_card', devDeckPos, playerPos, {
          delay: animDelay * 100,
          onComplete: () => {
            playerEl.classList.remove('pulse-receive');
            void playerEl.offsetWidth;
            playerEl.classList.add('pulse-receive');
          }
        });
        animDelay++;
      }
    }

    // 2. So khớp từng loại tài nguyên cụ thể (nếu có dữ liệu chi tiết - ví dụ cho bản thân hoặc khi kết thúc ván)
    if (currentP.resources && prevP.resources) {
      Object.entries(currentP.resources).forEach(([res, curCount]) => {
        const prevCount = prevP.resources[res] || 0;
        const diff = curCount - prevCount;

        if (diff > 0) {
          // Nhận thêm tài nguyên từ Ngân hàng: Ngân hàng -> Giữa bàn -> Người chơi
          const bankEl = getBankStackDomElement(res);
          const bankPos = bankEl
            ? { x: bankEl.getBoundingClientRect().left + bankEl.getBoundingClientRect().width / 2, y: bankEl.getBoundingClientRect().top + bankEl.getBoundingClientRect().height / 2 }
            : { x: window.innerWidth - 80, y: window.innerHeight / 2 };

          for (let i = 0; i < diff; i++) {
            sound.playResource(res, animDelay * 120);
            spawnFlyingItem(res, bankPos, playerPos, {
              delay: animDelay * 100,
              onComplete: () => {
                playerEl.classList.remove('pulse-receive');
                void playerEl.offsetWidth;
                playerEl.classList.add('pulse-receive');
              }
            });
            animDelay++;
          }
        } else if (diff < 0) {
          // Bị trừ tài nguyên về Ngân hàng: Người chơi -> Giữa bàn -> Ngân hàng
          const bankEl = getBankStackDomElement(res);
          const bankPos = bankEl
            ? { x: bankEl.getBoundingClientRect().left + bankEl.getBoundingClientRect().width / 2, y: bankEl.getBoundingClientRect().top + bankEl.getBoundingClientRect().height / 2 }
            : { x: window.innerWidth - 80, y: window.innerHeight / 2 };

          for (let i = 0; i < Math.abs(diff); i++) {
            spawnFlyingItem(res, playerPos, bankPos, {
              delay: animDelay * 100,
              onComplete: () => {
                if (bankEl) {
                  bankEl.classList.remove('pulse-receive');
                  void bankEl.offsetWidth;
                  bankEl.classList.add('pulse-receive');
                }
              }
            });
            animDelay++;
          }
        }
      });
    } else {
      // 3. So khớp tổng số tài nguyên (cho đối thủ)
      const curTotal = currentP.totalResourceCount || 0;
      const prevTotal = prevP.totalResourceCount || 0;
      const diffTotal = curTotal - prevTotal;

      if (diffTotal > 0) {
        const defaultBankPos = { x: window.innerWidth - 80, y: window.innerHeight / 2 };
        for (let i = 0; i < diffTotal; i++) {
          spawnFlyingItem('resource', defaultBankPos, playerPos, {
            delay: animDelay * 100,
            onComplete: () => {
              playerEl.classList.remove('pulse-receive');
              void playerEl.offsetWidth;
              playerEl.classList.add('pulse-receive');
            }
          });
          animDelay++;
        }
      } else if (diffTotal < 0) {
        const defaultBankPos = { x: window.innerWidth - 80, y: window.innerHeight / 2 };
        for (let i = 0; i < Math.abs(diffTotal); i++) {
          spawnFlyingItem('resource', playerPos, defaultBankPos, {
            delay: animDelay * 100
          });
          animDelay++;
        }
      }
    }
  });
}

// Cấu hình 4 vị trí người chơi tiêu chuẩn của Catan Classic (Đỏ, Xanh, Cam, Trắng)
const STANDARD_PLAYER_SLOTS = [
  { name: 'Đỏ', hex: '#e74c3c' },
  { name: 'Xanh dương', hex: '#3498db' },
  { name: 'Cam', hex: '#e67e22' },
  { name: 'Trắng', hex: '#ecf0f1' }
];

// Render danh sách người chơi ở Khung Người Chơi (Luôn đảm bảo hiện đầy đủ 4 người chơi)
function renderLeftPlayersPanel(gameState) {
  const targetBar = document.querySelector('#hudPlayersWidget #hudOtherPlayersBar') || document.getElementById('hudOtherPlayersBar');
  if (!targetBar) return;
  targetBar.innerHTML = '';
  const currentTurnId = gameState?.currentTurnPlayerId;
  const activeTurnPlayer = currentTurnId ? gameState?.players?.[currentTurnId] : null;
  const currentTurnColor = activeTurnPlayer?.color?.hex || '#3498db';

  const order = gameState?.turnOrder || (gameState?.players ? Object.keys(gameState.players) : []);
  const activePlayers = order.map(pId => gameState?.players?.[pId]).filter(Boolean);

  // Luôn duyệt và hiển thị đầy đủ 4 vị trí ghế người chơi
  for (let i = 0; i < 4; i++) {
    const p = activePlayers[i];
    const std = STANDARD_PLAYER_SLOTS[i] || { name: `Vị trí ${i + 1}`, hex: '#999' };

    if (p) {
      const isMe = (p.id === state.playerId);
      const isCurrentTurn = (p.id === currentTurnId);
      const isHost = (p.id === gameState?.hostId || p.id === state.room?.hostId || p.isHost);

      const card = document.createElement('div');
      card.className = 'player-panel-card';
      if (currentTurnId) {
        card.style.setProperty('--current-turn-color', currentTurnColor);
        card.classList.add('turn-in-progress');
      }
      if (isCurrentTurn) {
        card.classList.add('active-turn');
      }
      card.setAttribute('data-player-id', p.id);

      // 1. Danh hiệu xếp dọc ở góc trái trên của khung người chơi
      let badgesHtml = '';
      if (isHost) {
        badgesHtml += `<span class="title-badge badge-host" title="Chủ phòng Catan">👑</span>`;
      }
      if (p.hasLongestRoad) {
        badgesHtml += `<span class="title-badge badge-road" title="Đường Dài Nhất (+2 ĐCT, ≥5 đường)">🛣️</span>`;
      }
      if (p.hasLargestArmy) {
        badgesHtml += `<span class="title-badge badge-army" title="Đội Quân Lớn Nhất (+2 ĐCT, ≥3 hiệp sĩ)">⚔️</span>`;
      }

      // Biểu tượng đang thương lượng giao dịch 🤝
      const isNegotiating = state.currentTradeOffer &&
        (p.id === state.currentTradeOffer.senderId || p.id === state.currentTradeOffer.targetPlayerId);
      const negotiationBadgeHtml = isNegotiating
        ? `<span class="negotiation-badge" title="Đang trong quá trình thương lượng giao dịch">🤝</span>`
        : '';

      const cardCount = p.totalResourceCount || 0;
      const devCount = isMe
        ? (p.devCards?.filter(c => !c.isPlayed).length || 0)
        : (p.totalDevCardCount || 0);
      const vp = isMe ? (p.totalVictoryPoints || 0) : (p.publicVictoryPoints || 0);

      const colorHex = p.color?.hex || std.hex;
      const initial = p.name ? p.name.trim().charAt(0).toUpperCase() : `${i + 1}`;

      card.innerHTML = `
        <!-- Các danh hiệu xếp dọc ở góc trái trên -->
        <div class="player-badges-vertical">
          ${badgesHtml}
        </div>

        <!-- Avatar từng người chơi hình chữ nhật ngang -->
        <div class="player-rect-avatar" style="background: linear-gradient(135deg, ${colorHex} 0%, #161e1b 100%);">
          <span class="avatar-icon">👤</span>
          <span class="avatar-initial">${escapeHtml(initial)}</span>
        </div>

        <!-- Thông tin người chơi bên cạnh avatar -->
        <div class="p-card-content">
          <div class="p-card-name-row">
            <span class="p-card-name">${escapeHtml(p.name)}</span>
            ${negotiationBadgeHtml}
            ${isMe ? '<span class="you-tag">(Bạn)</span>' : ''}
          </div>
          <div class="p-card-stats">
            <span class="stat-item" title="Điểm chiến thắng">🏆 <strong>${vp}</strong>/10</span>
            <span class="stat-item" title="Thẻ tài nguyên">🎴 <strong>${cardCount}</strong></span>
            ${devCount > 0 ? `<span class="stat-item" title="Thẻ phát triển">🃏 <strong>${devCount}</strong></span>` : ''}
          </div>
        </div>
      `;

      // Nhấp hoặc Kéo thả tài nguyên vào đối thủ để mở giao dịch cá nhân (CHỈ TRONG LƯỢT CỦA BẠN)
      if (!isMe) {
        const isMyTurnNow = (gameState?.currentTurnPlayerId === state.playerId);
        const isMainPhaseNow = (gameState?.phase === 'TURN_MAIN');
        const canTrade = isMyTurnNow && isMainPhaseNow;

        if (canTrade) {
          card.style.cursor = 'pointer';
          card.setAttribute('title', `Kéo thả thẻ tài nguyên vào đây để giao dịch riêng với ${p.name}`);
        } else {
          card.style.cursor = 'default';
          card.setAttribute('title', `Chỉ được phép giao dịch trong lượt chính của bạn!`);
        }

        card.addEventListener('click', () => {});

        card.addEventListener('dragover', (e) => {
          if (!canTrade) return;
          e.preventDefault();
          card.classList.add('drop-hover');
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('drop-hover');
        });
        card.addEventListener('drop', (e) => {
          if (!canTrade) return;
          e.preventDefault();
          card.classList.remove('drop-hover');
          if (state.draggedData && state.draggedData.type === 'resource') {
            openDirectPlayerTradeModal(p.id, p.name, state.draggedData.resource);
          }
        });
      }

      targetBar.appendChild(card);
    } else {
      // Vị trí người chơi trống (Hiển thị đầy đủ 4 ghế - Không chứa chữ)
      const emptyCard = document.createElement('div');
      emptyCard.className = 'player-panel-card empty-slot';
      if (currentTurnId) {
        emptyCard.style.setProperty('--current-turn-color', currentTurnColor);
        emptyCard.classList.add('turn-in-progress');
      }
      emptyCard.innerHTML = `
        <div class="player-rect-avatar" style="background: rgba(255, 255, 255, 0.04); border-color: ${std.hex}44;">
          <span class="avatar-initial" style="color: ${std.hex}; opacity: 0.5;">${i + 1}</span>
        </div>
      `;
      targetBar.appendChild(emptyCard);
    }
  }
}

// Đồng bộ danh sách người chơi trong phòng lên bàn chơi
function renderLobbyPlayersOnBoard(room) {
  if (state.gameState) return; // Nếu đã bắt đầu ván thì Game State phụ trách
  const playersMap = (room?.players || []).reduce((acc, p) => {
    acc[p.id] = {
      ...p,
      totalVictoryPoints: 0,
      publicVictoryPoints: 0,
      totalResourceCount: 0,
      totalDevCardCount: 0
    };
    return acc;
  }, {});
  renderLeftPlayersPanel({
    currentTurnPlayerId: null,
    turnOrder: room?.players?.map(p => p.id) || [],
    hostId: room?.hostId,
    players: playersMap
  });
}

// Render các thẻ phát triển trong tay thành chip có thể kéo thả
function renderHandDevCards(devCards, isMyTurn, phase) {
  handDevCardsList.innerHTML = '';
  const playableCards = devCards.filter(c => !c.isPlayed);

  if (playableCards.length === 0) {
    handDevCardsList.innerHTML = '<span class="zoom-label">Chưa có thẻ bài</span>';
    return;
  }

  playableCards.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'draggable-dev-chip';
    chip.draggable = isMyTurn;
    chip.innerHTML = `${DEV_CARD_NAMES[c.type] || c.type}`;
    chip.title = isMyTurn ? 'Kéo thả ra giữa bàn cờ để đánh thẻ bài!' : 'Chưa tới lượt của bạn';

    chip.addEventListener('dragstart', (e) => {
      state.draggedData = { type: 'dev_card', cardType: c.type };
      e.dataTransfer.setData('text/plain', JSON.stringify(state.draggedData));
    });

    handDevCardsList.appendChild(chip);
  });
}

// ========================================================
// HỆ THỐNG CÀI ĐẶT TRÒ CHƠI & CHẾ ĐỘ TÚI THẺ
// ========================================================

// Áp dụng chế độ xem túi thẻ (Ô đếm số lượng vs Từng thẻ bài kéo thả)
function applyHandViewMode(mode = state.handViewMode) {
  state.handViewMode = mode;
  const isCards = (mode === 'cards');

  if (compactHandView) compactHandView.classList.toggle('hidden', isCards);
  if (cardsHandView) cardsHandView.classList.toggle('hidden', !isCards);

  // Đồng bộ radio button trong mục Cài Đặt
  const radio = document.querySelector(`input[name="handViewModeRadio"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

// Chuyển đổi chế độ xem túi thẻ
function setHandViewMode(newMode) {
  sound?.playBop?.();
  state.handViewMode = newMode;
  localStorage.setItem('catan_hand_view_mode', newMode);
  applyHandViewMode(newMode);

  if (state.gameState && state.playerId) {
    const myData = state.gameState.players?.[state.playerId];
    const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
    renderIndividualCards(myData, isMyTurn, state.gameState.phase);
  }
}

// Mở hộp thoại Cài đặt trò chơi
function openSettingsModal() {
  sound?.playBop?.();
  const curVol = sound.getVolume();
  const isMuted = sound.isMuted();

  if (settingsVolumeSlider) settingsVolumeSlider.value = isMuted ? 0 : Math.round(curVol * 100);
  if (settingsVolumePercent) settingsVolumePercent.textContent = isMuted ? '0%' : `${Math.round(curVol * 100)}%`;
  if (btnSettingsMute) {
    btnSettingsMute.textContent = isMuted ? '🔇' : (curVol < 0.35 ? '🔈' : (curVol < 0.7 ? '🔉' : '🔊'));
    btnSettingsMute.classList.toggle('muted', isMuted);
  }

  const radio = document.querySelector(`input[name="handViewModeRadio"][value="${state.handViewMode}"]`);
  if (radio) radio.checked = true;

  modalSettings?.classList.remove('hidden');
}

// Đóng hộp thoại Cài đặt trò chơi
function closeSettingsModal() {
  sound?.playBop?.();
  modalSettings?.classList.add('hidden');
}

// Thực hiện kích hoạt thẻ phát triển
function executePlayDevCard(cardType) {
  if (cardType === 'knight') {
    emitAsync('game:play_knight').then(res => {
      if (!res.success) alert(res.error);
      else addLog('Bạn đã kích hoạt thẻ Hiệp sĩ! Hãy di chuyển Tên cướp.', 'event');
    });
  } else if (cardType === 'year_of_plenty') {
    openDevCardsModal();
    yearOfPlentySelector.classList.remove('hidden');
  } else if (cardType === 'monopoly') {
    openDevCardsModal();
    monopolySelector.classList.remove('hidden');
  } else if (cardType === 'road_building') {
    emitAsync('game:play_road_building').then(res => {
      if (!res.success) alert(res.error);
      else addLog('Bạn đã kích hoạt Thẻ Xây 2 Đường!', 'event');
    });
  } else {
    openDevCardsModal();
  }
}

// Kéo thả thẻ bài tự do trên mặt bàn cờ (Pointer Events cao cấp)
function makeCardFreelyDraggable(card, cardKey, cardData) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let currentDy = 0;

  card.addEventListener('pointerdown', (e) => {
    // Chỉ xử lý chuột trái hoặc chạm cảm ứng
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    startX = e.clientX;
    startY = e.clientY;

    const savedPos = state.cardCustomPositions.get(cardKey);
    currentDx = savedPos ? savedPos.dx : 0;
    currentDy = savedPos ? savedPos.dy : 0;
    isDragging = false;

    const onPointerMove = (moveEvt) => {
      const deltaX = moveEvt.clientX - startX;
      const deltaY = moveEvt.clientY - startY;

      if (!isDragging) {
        if (Math.hypot(deltaX, deltaY) > 5) {
          isDragging = true;
          card.classList.add('is-freely-dragging');
          card.style.transition = 'none';
          card.style.zIndex = '9999';
          state.draggedData = cardData;
        }
      }

      if (isDragging) {
        const newDx = currentDx + deltaX;
        const newDy = currentDy + deltaY;
        const tilt = Math.max(-10, Math.min(10, deltaX * 0.08));
        card.style.transform = `translate3d(${newDx}px, ${newDy}px, 0) scale(1.08) rotate(${tilt}deg)`;

        // Highlight drop targets dưới con trỏ
        const elementsUnder = document.elementsFromPoint(moveEvt.clientX, moveEvt.clientY) || [];

        // 1. Highlight Ngân Hàng
        const isOverBank = elementsUnder.some(el => el.closest && el.closest('#hudBankWidget, .hud-bank-widget'));
        document.getElementById('hudBankWidget')?.classList.toggle('drop-hover', Boolean(isOverBank && cardData.type === 'resource'));

        // 2. Highlight Đối thủ
        document.querySelectorAll('.player-panel-card').forEach(pCard => {
          const isOverPlayer = elementsUnder.some(el => el === pCard || pCard.contains(el));
          const isMe = (pCard.getAttribute('data-player-id') === state.playerId);
          pCard.classList.toggle('drop-hover', Boolean(isOverPlayer && !isMe && cardData.type === 'resource'));
        });

        // 3. Highlight Cảng
        const portElem = elementsUnder.find(el => el.closest && el.closest('.port-item, .port-group, .port-click-area'));
        if (portElem && cardData.type === 'resource') {
          portElem.closest('.port-item')?.classList.add('drop-hover');
        } else {
          document.querySelectorAll('.port-item.drop-hover').forEach(p => p.classList.remove('drop-hover'));
        }

        // 4. Highlight Bàn cờ SVG nếu là Dev card
        if (cardData.type === 'dev_card') {
          const isOverBoard = elementsUnder.some(el => el.closest && el.closest('#svgBoardContainer, .svg-board-container'));
          document.getElementById('svgBoardContainer')?.classList.toggle('drop-hover', Boolean(isOverBoard && cardData.canPlay));
        }
      }
    };

    const onPointerUp = (upEvt) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      // Dọn dẹp highlight drop targets
      document.getElementById('hudBankWidget')?.classList.remove('drop-hover');
      document.querySelectorAll('.player-panel-card.drop-hover').forEach(p => p.classList.remove('drop-hover'));
      document.querySelectorAll('.port-item.drop-hover').forEach(p => p.classList.remove('drop-hover'));
      document.getElementById('svgBoardContainer')?.classList.remove('drop-hover');

      if (isDragging) {
        card.classList.remove('is-freely-dragging');
        state.draggedData = null;

        const deltaX = upEvt.clientX - startX;
        const deltaY = upEvt.clientY - startY;
        const finalDx = currentDx + deltaX;
        const finalDy = currentDy + deltaY;

        const elementsUnder = document.elementsFromPoint(upEvt.clientX, upEvt.clientY) || [];

        // 1. Thả vào Ngân hàng Catan
        const isOverBank = elementsUnder.some(el => el.closest && el.closest('#hudBankWidget, .hud-bank-widget'));
        if (isOverBank && cardData.type === 'resource') {
          sound?.playBuild?.('settlement');
          state.cardCustomPositions.delete(cardKey);
          card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
          card.style.transform = 'none';
          card.style.zIndex = '';
          openBankTradeModal(cardData.resource);
          return;
        }

        // 2. Thả vào Đối thủ để mở giao dịch cá nhân
        const opponentCard = elementsUnder.find(el => el.closest && el.closest('.player-panel-card:not([data-player-id="' + state.playerId + '"])'));
        if (opponentCard && cardData.type === 'resource') {
          const targetPlayerId = opponentCard.closest('.player-panel-card').getAttribute('data-player-id');
          const targetPlayerName = opponentCard.closest('.player-panel-card').querySelector('.p-card-name')?.textContent?.trim() || 'đối thủ';
          state.cardCustomPositions.delete(cardKey);
          card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
          card.style.transform = 'none';
          card.style.zIndex = '';
          openDirectPlayerTradeModal(targetPlayerId, targetPlayerName, cardData.resource);
          return;
        }

        // 3. Thả vào Cảng trên bản đồ SVG
        const portElem = elementsUnder.find(el => el.closest && el.closest('.port-item, .port-group, .port-click-area'));
        if (portElem && cardData.type === 'resource') {
          const portItem = portElem.closest('.port-item') || portElem;
          const portId = portItem.getAttribute('data-port-id');
          const portType = portItem.getAttribute('data-port-type') || 'generic';
          const port = state.gameState?.board?.ports?.find(p => p.id === portId) ||
                       state.board?.ports?.find(p => p.id === portId) ||
                       { id: portId, type: portType, vertexIds: [] };
          state.cardCustomPositions.delete(cardKey);
          card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
          card.style.transform = 'none';
          card.style.zIndex = '';
          handlePortResourceDrop(port, cardData.resource);
          return;
        }

        // 4. Thả Thẻ phát triển ra giữa Bàn cờ SVG để kích hoạt
        const isOverBoard = elementsUnder.some(el => el.closest && el.closest('#svgBoardContainer, .svg-board-container'));
        if (isOverBoard && cardData.type === 'dev_card' && cardData.canPlay) {
          state.cardCustomPositions.delete(cardKey);
          card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
          card.style.transform = 'none';
          card.style.zIndex = '';
          executePlayDevCard(cardData.cardType);
          return;
        }

        // 5. Thả tự do trên bàn cờ / khay thẻ
        if (Math.hypot(finalDx, finalDy) < 25) {
          // Kéo về gần vị trí khay túi thẻ ban đầu -> tự động hút về khay
          state.cardCustomPositions.delete(cardKey);
          card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
          card.style.transform = 'none';
          card.style.zIndex = '';
          sound?.playBop?.();
        } else {
          // Đặt cố định tại vị trí người chơi vừa thả tự do trên bàn
          state.cardCustomPositions.set(cardKey, { dx: finalDx, dy: finalDy });
          card.style.transition = 'transform 0.15s ease-out';
          card.style.transform = `translate3d(${finalDx}px, ${finalDy}px, 0)`;
          card.style.zIndex = '70';
          sound?.playBop?.();
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });
}

// Xếp gọn và sắp xếp lại các lá bài ngay ngắn theo thứ tự
function sortAndAlignCards() {
  sound?.playDice?.();
  state.cardCustomPositions.clear();

  const allCards = document.querySelectorAll('#individualCardsList .ind-card-item');
  allCards.forEach(card => {
    card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s ease';
    card.style.transform = 'none';
    card.style.zIndex = '';
  });

  setTimeout(() => {
    if (state.gameState && state.playerId) {
      const myData = state.gameState.players?.[state.playerId];
      const isMyTurn = (state.gameState.currentTurnPlayerId === state.playerId);
      renderIndividualCards(myData, isMyTurn, state.gameState.phase);
    } else {
      allCards.forEach(card => {
        card.style.transition = '';
      });
    }
  }, 360);

  addLog('Đã thu gọn và xếp lại các lá bài trong túi ngay ngắn theo thứ tự!', 'system');
}

// Render từng lá bài tài nguyên và thẻ phát triển riêng lẻ (Chế độ Thẻ bài kéo thả tự do)
function renderIndividualCards(myData, isMyTurn, phase) {
  if (!individualCardsList) return;
  individualCardsList.innerHTML = '';

  if (!myData) {
    if (btnSortCards) btnSortCards.style.display = 'none';
    individualCardsList.innerHTML = `
      <div class="ind-cards-empty">
        <div class="empty-icon">🎴</div>
        <div class="empty-text">Chưa có thông tin túi thẻ</div>
      </div>
    `;
    return;
  }

  const resOrder = ['wood', 'clay', 'sheep', 'wheat', 'ore'];
  let totalCardsCount = 0;

  // 1. Thẻ tài nguyên (Mỗi lá bài riêng lẻ)
  const resources = myData.resources || {};
  resOrder.forEach(res => {
    const count = resources[res] || 0;
    const icon = RESOURCE_ICONS[res] || '📦';
    const name = RESOURCE_NAMES[res] || res;

    for (let i = 0; i < count; i++) {
      totalCardsCount++;
      const cardKey = `res_${res}_${i}`;
      const card = document.createElement('div');
      card.className = `ind-card-item ind-res-card res-${res}`;
      card.setAttribute('data-res', res);
      card.setAttribute('data-index', i);
      card.setAttribute('data-card-key', cardKey);
      card.style.cursor = 'grab';
      card.title = `Kéo thả lá bài ${name} tự do trên bàn, hoặc thả vào Ngân hàng / Đối thủ / Cảng để giao dịch! (Bấm đúp để mở đổi Ngân hàng)`;

      card.innerHTML = `
        <div class="ind-card-glow"></div>
        <div class="ind-card-top">
          <span class="ind-card-mini-icon">${icon}</span>
          <span class="ind-card-type-tag">Tài nguyên</span>
        </div>
        <div class="ind-card-artwork">
          <span class="ind-card-big-icon">${icon}</span>
        </div>
        <div class="ind-card-bottom">
          <span class="ind-card-title">${name}</span>
        </div>
      `;

      // Khôi phục vị trí người chơi đã kéo thả trước đó (nếu có)
      const savedPos = state.cardCustomPositions.get(cardKey);
      if (savedPos) {
        card.style.transform = `translate3d(${savedPos.dx}px, ${savedPos.dy}px, 0)`;
        card.style.zIndex = '70';
      }

      // Gán sự kiện kéo thả tự do cao cấp
      makeCardFreelyDraggable(card, cardKey, { type: 'resource', resource: res });

      // Bấm đúp để mở nhanh giao dịch ngân hàng
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openBankTradeModal(res);
      });

      individualCardsList.appendChild(card);
    }
  });

  // 2. Thẻ phát triển (Dev Cards)
  const devCards = myData.devCards || [];
  const unplayedCards = devCards.filter(c => !c.isPlayed);

  unplayedCards.forEach((c, idx) => {
    totalCardsCount++;
    const cardKey = `dev_${c.type}_${c.id || idx}`;
    const card = document.createElement('div');
    card.className = `ind-card-item ind-dev-card dev-${c.type}`;
    card.setAttribute('data-card-type', c.type);
    card.setAttribute('data-card-key', cardKey);

    const icon = DEV_CARD_ICONS[c.type] || '🃏';
    const title = DEV_CARD_SHORT_NAMES[c.type] || c.type;
    const isVP = (c.type === 'victory_point');
    const isTurnBought = (c.turnBought === state.gameState?.turnNumber);
    const canPlay = isMyTurn && !isTurnBought && (phase === 'TURN_MAIN' || (c.type === 'knight' && phase === 'TURN_ROLL'));

    card.style.cursor = 'grab';

    let tooltip = '';
    if (isVP) {
      tooltip = `${title}: +1 Điểm Chiến Thắng (Ẩn, tính vào tổng điểm cuối cùng). Kéo thả tự do để sắp xếp!`;
    } else if (canPlay) {
      tooltip = `Kéo thả lá bài ${title} tự do, thả ra giữa bàn cờ hoặc bấm đúp để đánh thẻ!`;
    } else if (isTurnBought) {
      tooltip = `${title}: Mua trong lượt này (chưa thể sử dụng). Có thể kéo thả sắp xếp tự do!`;
    } else {
      tooltip = `${title}: Chưa tới lượt của bạn. Có thể kéo thả sắp xếp tự do!`;
    }
    card.title = tooltip;

    card.innerHTML = `
      <div class="ind-card-glow"></div>
      <div class="ind-card-top">
        <span class="ind-card-mini-icon">${icon}</span>
        <span class="ind-card-type-tag dev-tag">Phát triển</span>
      </div>
      <div class="ind-card-artwork">
        <span class="ind-card-big-icon">${icon}</span>
      </div>
      <div class="ind-card-bottom">
        <span class="ind-card-title">${title}</span>
      </div>
    `;

    // Khôi phục vị trí tự do nếu đã kéo thả
    const savedPos = state.cardCustomPositions.get(cardKey);
    if (savedPos) {
      card.style.transform = `translate3d(${savedPos.dx}px, ${savedPos.dy}px, 0)`;
      card.style.zIndex = '70';
    }

    // Cho phép kéo thả tự do mọi thẻ bài
    makeCardFreelyDraggable(card, cardKey, {
      type: 'dev_card',
      cardType: c.type,
      canPlay: Boolean(canPlay && !isVP)
    });

    // Bấm đúp thẻ
    card.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (canPlay && !isVP) {
        executePlayDevCard(c.type);
      } else {
        openDevCardsModal();
      }
    });

    individualCardsList.appendChild(card);
  });

  // 3. Trạng thái túi thẻ trống
  if (totalCardsCount === 0) {
    if (btnSortCards) btnSortCards.style.display = 'none';
    individualCardsList.innerHTML = `
      <div class="ind-cards-empty">
        <div class="empty-icon">🎴</div>
        <div class="empty-text">Túi thẻ bài trống</div>
        <div class="empty-sub">Tài nguyên & Thẻ phát triển bạn sở hữu sẽ xuất hiện tại đây dưới dạng thẻ bài</div>
      </div>
    `;
  } else {
    if (btnSortCards) btnSortCards.style.display = 'inline-flex';
  }
}

// Mở pop-up giao dịch cá nhân với 1 người chơi cụ thể (Chỉ trong lượt của bạn)
function openDirectPlayerTradeModal(targetPlayerId, targetPlayerName, initialResource = null) {
  const isMyTurn = (state.gameState?.currentTurnPlayerId === state.playerId);
  const isMainPhase = (state.gameState?.phase === 'TURN_MAIN');
  if (!isMyTurn || !isMainPhase) return;

  state.tradeTargetPlayerId = targetPlayerId;
  if (playerTradeTargetName) {
    playerTradeTargetName.textContent = targetPlayerName || 'Đối thủ';
  }
  resetDomesticTradeCounters();
  if (initialResource) {
    domesticTradeState.give[initialResource] = 1;
  }
  updateDomesticTradeUI();
  modalPlayerTrade.classList.remove('hidden');
}

let currentActivePort = null;

// Mở pop-up giao dịch Ngân hàng (Cố định 4:1)
function openBankTradeModal(preselectedGiveRes = null) {
  const isMyTurn = (state.gameState?.currentTurnPlayerId === state.playerId);
  const phase = state.gameState?.phase;
  if (!isMyTurn || phase !== 'TURN_MAIN') return;

  if (preselectedGiveRes && bankTradeGiveSelect) {
    bankTradeGiveSelect.value = preselectedGiveRes;
  }
  updateBankTradeInfo();
  modalBankTrade.classList.remove('hidden');
}

// Xử lý khi kéo thả tài nguyên vào Cảng trên bàn cờ
function handlePortResourceDrop(port, draggedResource) {
  if (!state.gameState || !state.playerId) return;

  // Kiểm tra xem người chơi có nhà / thành phố tại cảng này không
  const board = state.gameState.board;
  const hasAccess = port.vertexIds?.some(vId => {
    const v = board?.vertices?.[vId];
    return v && v.building && v.building.playerId === state.playerId;
  });

  if (!hasAccess) return;

  const isMyTurn = (state.gameState?.currentTurnPlayerId === state.playerId);
  const phase = state.gameState?.phase;
  if (!isMyTurn || phase !== 'TURN_MAIN') return;

  openPortTradeModal(port, draggedResource);
}

// Mở pop-up giao dịch Cảng biển (2:1 chuyên dụng hoặc 3:1 tổng hợp)
function openPortTradeModal(port, preselectedRes = null) {
  currentActivePort = port;
  const isSpecialized = (port.type !== '3:1' && port.type !== 'generic');
  const ratio = isSpecialized ? 2 : 3;

  if (portTradeTitle) {
    portTradeTitle.textContent = `⚓ GIAO DỊCH CẢNG (${ratio} : 1)`;
  }

  if (portBadgeNotice) {
    if (isSpecialized) {
      portBadgeNotice.textContent = `⚓ Cảng Chuyên Dụng 2:1 (${RESOURCE_NAMES[port.type] || port.type})`;
    } else {
      portBadgeNotice.textContent = `⚓ Cảng Tổng Hợp 3:1 (Mọi tài nguyên)`;
    }
  }

  if (portTradeGiveBadge) {
    portTradeGiveBadge.textContent = `BẠN ĐƯA (${ratio})`;
  }

  if (isSpecialized) {
    // Cảng 2:1 -> Cố định tài nguyên đưa ra là loại của cảng
    if (portTradeGiveSelect) portTradeGiveSelect.classList.add('hidden');
    if (portTradeFixedGive) portTradeFixedGive.classList.remove('hidden');
    if (portFixedResIcon) portFixedResIcon.textContent = RESOURCE_ICONS[port.type] || '📦';
    if (portFixedResName) portFixedResName.textContent = RESOURCE_NAMES[port.type] || port.type;

    // Chọn mặc định tài nguyên nhận khác với loại cảng
    const otherRes = ['wood', 'clay', 'sheep', 'wheat', 'ore'].find(r => r !== port.type);
    if (portTradeGetSelect && otherRes) portTradeGetSelect.value = otherRes;
  } else {
    // Cảng 3:1 -> Tự do chọn tài nguyên đưa ra
    if (portTradeGiveSelect) {
      portTradeGiveSelect.classList.remove('hidden');
      if (preselectedRes) {
        portTradeGiveSelect.value = preselectedRes;
      }
    }
    if (portTradeFixedGive) portTradeFixedGive.classList.add('hidden');
  }

  updatePortTradeInfo();
  modalPortTrade.classList.remove('hidden');
}

// ========================================================
// HỆ THỐNG KÉO THẢ DI CHUYỂN TỰ DO CÁC TAB (DRAGGABLE TABS)
// ========================================================
let highestTabZIndex = 35;

function bringTabToFront(el) {
  if (!el) return;
  highestTabZIndex++;
  el.style.zIndex = highestTabZIndex;
}

function makeTabDraggable(element, handleElement = null) {
  if (!element) return;
  const handle = handleElement || element.querySelector('.hud-drag-handle') || element.querySelector('.hud-tab-header') || element;
  if (!handle) return;

  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  element.addEventListener('pointerdown', () => {
    bringTabToFront(element);
  });

  handle.addEventListener('pointerdown', (e) => {
    // Không drag nếu click vào button, input, hoặc quân cờ bên trong
    if (e.target.closest('button, input, select, .btn, .btn-zoom-card, .dock-token-item, .res-card-item')) {
      return;
    }

    isDragging = true;
    element.classList.add('is-dragging-tab');
    bringTabToFront(element);

    const rect = element.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;

    // Chuyển vị trí từ CSS transform/bottom/right sang tọa độ pixel tuyệt đối
    element.style.transform = 'none';
    element.style.bottom = 'auto';
    element.style.right = 'auto';
    element.style.left = `${initialLeft}px`;
    element.style.top = `${initialTop}px`;

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}

    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Giới hạn trong khung nhìn màn hình
    const maxLeft = window.innerWidth - element.offsetWidth - 4;
    const maxTop = window.innerHeight - element.offsetHeight - 4;
    newLeft = Math.max(4, Math.min(newLeft, maxLeft));
    newTop = Math.max(44, Math.min(newTop, maxTop)); // Dưới header 44px

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      element.classList.remove('is-dragging-tab');
      try {
        if (e.pointerId) handle.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
}

function setupDraggableTabs() {
  // Chú ý: hudPlayersWidget và viewerHandSection là tab CỐ ĐỊNH, không được kéo thả di chuyển
  const tabs = [
    { el: document.getElementById('hudDiceWidget'), handle: null },
    { el: document.getElementById('hudBankWidget'), handle: null },
    { el: document.getElementById('buildingDock'), handle: document.querySelector('.dock-drag-handle') },
    { el: document.getElementById('floatingLogDrawer'), handle: document.getElementById('logHeader') || document.querySelector('#floatingLogDrawer .log-header') }
  ];

  tabs.forEach(({ el, handle }) => {
    if (el) {
      makeTabDraggable(el, handle);
    }
  });
}

// ========================================================
// CÀI ĐẶT THAO TÁC KÉO THẢ QUÂN CỜ (DRAG & DROP PIECES)
// ========================================================

function setupDragAndDrop() {
  // 1. Kéo thả các quân cờ và Token từ Building Dock (Nhà / Thành phố / Đường / Thẻ bài)
  [
    { el: dragTokenSettlement, type: 'settlement' },
    { el: dragTokenCity, type: 'city' },
    { el: dragTokenRoad, type: 'road' },
    { el: dragTokenDevCard, type: 'buy_dev_card' }
  ].forEach(({ el, type }) => {
    if (!el) return;
    el.addEventListener('dragstart', (e) => {
      // Nếu không đủ tài sản hoặc quân cờ thì chặn kéo thả hoàn toàn
      if (!el.draggable || el.classList.contains('disabled-dock-item')) {
        e.preventDefault();
        return;
      }

      state.draggedData = { type };
      e.dataTransfer.setData('text/plain', JSON.stringify({ type }));
      if (type !== 'buy_dev_card' && state.boardRenderer) {
        state.boardRenderer.highlightDropTargets(type, {
          playerId: state.playerId,
          isSetupPhase: Boolean(state.gameState?.phase?.startsWith('SETUP_')),
          setupStep: state.gameState?.setupStep,
          setupSettlementVertexId: state.gameState?.setupLastSettlementVertexId
        });
      }
    });

    el.addEventListener('dragend', () => {
      state.draggedData = null;
      if (state.boardRenderer) {
        state.boardRenderer.clearDropTargetHighlights();
      }
    });
  });

  // 2. Kéo thả thẻ tài nguyên từ Túi thẻ
  document.querySelectorAll('.res-card-item').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      const res = card.getAttribute('data-res');
      state.draggedData = { type: 'resource', resource: res };
      e.dataTransfer.setData('text/plain', JSON.stringify(state.draggedData));
    });

    card.addEventListener('dragend', () => {
      state.draggedData = null;
    });
  });

  // 3. Vùng thả: Bản đồ SVG (Nhận quân cờ, thẻ bài hoặc kéo tài nguyên vào Cảng)
  svgBoardContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  svgBoardContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    if (state.boardRenderer) {
      state.boardRenderer.clearDropTargetHighlights();
    }
    if (!state.draggedData) return;

    const { type, cardType } = state.draggedData;
    state.draggedData = null;

    // A. Thả quân cờ: Tìm đỉnh hoặc cạnh dưới con trỏ
    if (type === 'settlement' || type === 'city' || type === 'road') {
      const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);

      if (type === 'settlement') {
        const vElem = elementsUnder.find(el => el.closest && el.closest('.vertex-slot'));
        const vertexId = vElem?.closest('.vertex-slot')?.getAttribute('data-vertex-id');
        if (vertexId) {
          executePlaceSettlement(vertexId);
        }
      } else if (type === 'city') {
        const vElem = elementsUnder.find(el => el.closest && el.closest('.vertex-slot'));
        const vertexId = vElem?.closest('.vertex-slot')?.getAttribute('data-vertex-id');
        if (vertexId) {
          executePlaceCity(vertexId);
        }
      } else if (type === 'road') {
        const eElem = elementsUnder.find(el => el.closest && el.closest('.edge-slot'));
        const edgeId = eElem?.closest('.edge-slot')?.getAttribute('data-edge-id');
        if (edgeId) {
          executePlaceRoad(edgeId);
        }
      }
    }

    // A2. Thả Tên cướp lên ô lục giác
    if (type === 'robber') {
      const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
      const hElem = elementsUnder.find(el => el.closest && el.closest('.hex-item'));
      const hexId = hElem?.closest('.hex-item')?.getAttribute('data-hex-id');
      if (hexId) {
        handleBoardHexClick(hexId);
      }
    }

    // B. Thả thẻ phát triển ra giữa bàn cờ để đánh (Ví dụ: Hiệp sĩ, Bội thu, Độc quyền)
    if (type === 'dev_card') {
      if (cardType === 'knight') {
        emitAsync('game:play_knight').then(res => {
          if (!res.success) alert(res.error);
          else addLog('Bạn đã kích hoạt thẻ Hiệp sĩ! Hãy di chuyển Tên cướp.', 'event');
        });
      } else if (cardType === 'year_of_plenty') {
        openDevCardsModal();
        yearOfPlentySelector.classList.remove('hidden');
      } else if (cardType === 'monopoly') {
        openDevCardsModal();
        monopolySelector.classList.remove('hidden');
      }
    }

    // C. Thả tài nguyên vào Cảng trên bàn cờ SVG để giao dịch cảng
    if (type === 'resource') {
      const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
      const portElem = elementsUnder.find(el => el.closest && el.closest('.port-item'));
      if (portElem) {
        const portItem = portElem.closest('.port-item');
        const portId = portItem.getAttribute('data-port-id');
        const portType = portItem.getAttribute('data-port-type') || 'generic';
        const port = state.gameState?.board?.ports?.find(p => p.id === portId) ||
                     state.board?.ports?.find(p => p.id === portId) ||
                     { id: portId, type: portType, vertexIds: [] };
        handlePortResourceDrop(port, state.draggedData.resource);
        return;
      }
    }
  });

  // 4. Vùng thả: Ngân hàng Catan (Nhận tài nguyên để mở nhanh giao dịch ngân hàng)
  hudBankWidget.addEventListener('dragover', (e) => {
    e.preventDefault();
    hudBankWidget.classList.add('drop-hover');
  });

  hudBankWidget.addEventListener('dragleave', () => {
    hudBankWidget.classList.remove('drop-hover');
  });

  hudBankWidget.addEventListener('drop', (e) => {
    e.preventDefault();
    hudBankWidget.classList.remove('drop-hover');

    if (state.draggedData && state.draggedData.type === 'resource') {
      const res = state.draggedData.resource;
      openBankTradeModal(res);
    }
  });

  // 5. Vùng thả: Túi thẻ (Kéo Token Thẻ bài từ Building Dock vào Túi thẻ để Mua thẻ phát triển)
  viewerHandSection?.addEventListener('dragover', (e) => {
    if (state.draggedData && state.draggedData.type === 'buy_dev_card') {
      e.preventDefault();
      viewerHandSection.classList.add('drop-hover');
    }
  });

  viewerHandSection?.addEventListener('dragleave', () => {
    viewerHandSection.classList.remove('drop-hover');
  });

  viewerHandSection?.addEventListener('drop', async (e) => {
    viewerHandSection.classList.remove('drop-hover');
    if (state.draggedData && state.draggedData.type === 'buy_dev_card') {
      e.preventDefault();
      try {
        const res = await emitAsync('game:buy_dev_card');
        if (!res.success) {
          alert(res.error);
        } else {
          addLog('Bạn đã kéo mua thành công 1 Thẻ phát triển!', 'success');
        }
      } catch (err) {
        alert(err.message);
      }
    }
  });

  // 6. Đảm bảo dọn dẹp sạch sẽ toàn bộ highlight khi thao tác kéo kết thúc ở bất kỳ đâu trên cửa sổ
  window.addEventListener('dragend', () => {
    state.draggedData = null;
    if (state.boardRenderer) {
      state.boardRenderer.clearDropTargetHighlights();
    }
  });
}

// ========================================================
// HỆ THỐNG GIAO DỊCH (TRADE SUBSYSTEM)
// ========================================================

function updateBankTradeInfo() {
  if (!bankTradeGiveSelect || !bankTradeGetSelect) return;
  const giveRes = bankTradeGiveSelect.value;
  const getRes = bankTradeGetSelect.value;
  const ratio = 4;
  const myAmount = state.gameState?.players[state.playerId]?.resources?.[giveRes] || 0;
  const bankAmount = state.gameState?.bank?.[getRes] || 0;

  if (bankTradeGiveStock) {
    bankTradeGiveStock.textContent = `Bạn có: ${myAmount} ${RESOURCE_NAMES[giveRes] || giveRes}`;
    bankTradeGiveStock.style.color = myAmount >= ratio ? '#2ecc71' : '#e74c3c';
  }

  if (bankTradeGetStock) {
    bankTradeGetStock.textContent = `Kho còn: ${bankAmount}`;
    bankTradeGetStock.style.color = bankAmount > 0 ? '#f1c40f' : '#e74c3c';
  }

  if (btnExecuteBankTrade) {
    const canTrade = (myAmount >= ratio && bankAmount > 0 && giveRes !== getRes);
    btnExecuteBankTrade.disabled = !canTrade;
    btnExecuteBankTrade.textContent = `Đổi 4 ${RESOURCE_NAMES[giveRes] || giveRes} lấy 1 ${RESOURCE_NAMES[getRes] || getRes}`;
  }
}

function updatePortTradeInfo() {
  if (!currentActivePort || !portTradeGetSelect) return;
  const isSpecialized = (currentActivePort.type !== '3:1' && currentActivePort.type !== 'generic');
  const ratio = isSpecialized ? 2 : 3;
  const giveRes = isSpecialized ? currentActivePort.type : (portTradeGiveSelect?.value || 'wood');
  const getRes = portTradeGetSelect.value;

  const myAmount = state.gameState?.players[state.playerId]?.resources?.[giveRes] || 0;
  const bankAmount = state.gameState?.bank?.[getRes] || 0;

  if (portTradeGiveStock) {
    portTradeGiveStock.textContent = `Bạn có: ${myAmount} ${RESOURCE_NAMES[giveRes] || giveRes}`;
    portTradeGiveStock.style.color = myAmount >= ratio ? '#2ecc71' : '#e74c3c';
  }

  if (portTradeGetStock) {
    portTradeGetStock.textContent = `Kho còn: ${bankAmount}`;
    portTradeGetStock.style.color = bankAmount > 0 ? '#f1c40f' : '#e74c3c';
  }

  if (btnExecutePortTrade) {
    const canTrade = (myAmount >= ratio && bankAmount > 0 && giveRes !== getRes);
    btnExecutePortTrade.disabled = !canTrade;
    btnExecutePortTrade.textContent = `Đổi ${ratio} ${RESOURCE_NAMES[giveRes] || giveRes} lấy 1 ${RESOURCE_NAMES[getRes] || getRes}`;
  }
}

function updateDomesticTradeUI() {
  ['wood', 'clay', 'sheep', 'wheat', 'ore'].forEach(r => {
    const giveEl = document.getElementById(`domesticGive${capitalize(r)}`);
    const getEl = document.getElementById(`domesticGet${capitalize(r)}`);
    if (giveEl) giveEl.textContent = domesticTradeState.give[r];
    if (getEl) getEl.textContent = domesticTradeState.receive[r];
  });

  const hasGive = Object.values(domesticTradeState.give).some(v => v > 0);
  const hasGet = Object.values(domesticTradeState.receive).some(v => v > 0);
  btnSendPlayerTradeOffer.disabled = !(hasGive && hasGet);
}

function resetDomesticTradeCounters() {
  ['wood', 'clay', 'sheep', 'wheat', 'ore'].forEach(r => {
    domesticTradeState.give[r] = 0;
    domesticTradeState.receive[r] = 0;
  });
  updateDomesticTradeUI();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handleIncomingTradeProposal(tradeOffer) {
  state.currentTradeOffer = tradeOffer;
  renderLeftPlayersPanel(state.gameState);

  if (tradeOffer.senderId === state.playerId) {
    activeTradeStatusBox.classList.remove('hidden');
    renderTradeResponses(tradeOffer);
    return;
  }

  // Nếu đề xuất gửi tới cá nhân và không phải gửi cho bạn thì bỏ qua modal
  if (tradeOffer.targetPlayerId && tradeOffer.targetPlayerId !== state.playerId) {
    return;
  }

  const sender = state.gameState?.players[tradeOffer.senderId];
  tradeProposalAuthor.textContent = `${sender?.name || 'Đối thủ'} gửi tới bạn đề xuất giao dịch:`;

  tradeProposalGiveCards.innerHTML = '';
  Object.entries(tradeOffer.give).forEach(([res, count]) => {
    if (count > 0) {
      const tag = document.createElement('span');
      tag.className = 'res-tag';
      tag.textContent = `${count} ${RESOURCE_NAMES[res] || res}`;
      tradeProposalGiveCards.appendChild(tag);
    }
  });

  tradeProposalReceiveCards.innerHTML = '';
  Object.entries(tradeOffer.receive).forEach(([res, count]) => {
    if (count > 0) {
      const tag = document.createElement('span');
      tag.className = 'res-tag';
      tag.textContent = `${count} ${RESOURCE_NAMES[res] || res}`;
      tradeProposalReceiveCards.appendChild(tag);
    }
  });

  modalTradeProposal.classList.remove('hidden');
}

function handleTradeUpdate(tradeUpdate) {
  state.currentTradeOffer = tradeUpdate;
  renderLeftPlayersPanel(state.gameState);

  if (!tradeUpdate || tradeUpdate.status === 'COMPLETED' || tradeUpdate.status === 'CANCELLED') {
    modalTradeProposal.classList.add('hidden');
    activeTradeStatusBox.classList.add('hidden');
    return;
  }

  if (tradeUpdate.senderId === state.playerId) {
    activeTradeStatusBox.classList.remove('hidden');
    renderTradeResponses(tradeUpdate);
  }
}

function renderTradeResponses(tradeOffer) {
  tradeResponsesList.innerHTML = '';
  if (!tradeOffer.acceptedPlayerIds || tradeOffer.acceptedPlayerIds.length === 0) {
    tradeResponsesList.innerHTML = '<div class="trade-resp-item">Đang chờ phản hồi...</div>';
    return;
  }

  tradeOffer.acceptedPlayerIds.forEach(pId => {
    const p = state.gameState?.players[pId];
    const row = document.createElement('div');
    row.className = 'trade-resp-item';
    row.innerHTML = `
      <span>✓ <strong>${escapeHtml(p?.name || 'Người chơi')}</strong> đồng ý đổi!</span>
      <button class="btn btn-success btn-sm btn-confirm-partner" data-pid="${pId}">Xác nhận đổi</button>
    `;
    row.querySelector('.btn-confirm-partner').addEventListener('click', async () => {
      try {
        const res = await emitAsync('game:trade_confirm', { partnerId: pId });
        if (!res.success) alert(res.error);
        else {
          addLog(`Đã hoàn tất giao dịch với ${p?.name}!`, 'success');
          modalPlayerTrade.classList.add('hidden');
          activeTradeStatusBox.classList.add('hidden');
          state.currentTradeOffer = null;
          renderLeftPlayersPanel(state.gameState);
        }
      } catch (err) {
        alert(err.message);
      }
    });
    tradeResponsesList.appendChild(row);
  });
}

// ========================================================
// HỆ THỐNG BỎ BÀI KHI RA SỐ 7 (DISCARD MODAL)
// ========================================================

function openDiscardModal(requiredCount, myResources) {
  currentDiscardRequired = requiredCount;
  discardRequiredCount.textContent = requiredCount;

  const isAlreadyOpen = !modalDiscard.classList.contains('hidden');

  ['wood', 'clay', 'sheep', 'wheat', 'ore'].forEach(r => {
    if (!isAlreadyOpen) {
      discardState[r] = 0;
    }
    const maxEl = document.getElementById(`discardMax${capitalize(r)}`);
    const valEl = document.getElementById(`discardVal${capitalize(r)}`);
    if (maxEl) maxEl.textContent = myResources[r] || 0;
    if (valEl) valEl.textContent = discardState[r] || 0;
  });

  updateDiscardUI();
  modalDiscard.classList.remove('hidden');
}

function updateDiscardUI() {
  let totalSelected = 0;
  ['wood', 'clay', 'sheep', 'wheat', 'ore'].forEach(r => {
    const count = discardState[r] || 0;
    totalSelected += count;
    const valEl = document.getElementById(`discardVal${capitalize(r)}`);
    if (valEl) valEl.textContent = count;
  });

  discardCurrentCount.textContent = totalSelected;
  btnConfirmDiscard.disabled = (totalSelected !== currentDiscardRequired);
}

// ========================================================
// HỆ THỐNG THẺ PHÁT TRIỂN (DEVELOPMENT CARDS MODAL)
// ========================================================

function openDevCardsModal() {
  const myData = state.gameState?.players[state.playerId];
  if (!myData || !myData.devCards) return;

  myDevCardsList.innerHTML = '';
  yearOfPlentySelector.classList.add('hidden');
  monopolySelector.classList.add('hidden');

  const cards = myData.devCards;
  if (cards.length === 0) {
    myDevCardsList.innerHTML = '<p class="tab-desc">Bạn chưa sở hữu thẻ phát triển nào. Hãy mua thẻ với chi phí 1 Cừu, 1 Lúa mì, 1 Quặng!</p>';
    modalDevCards.classList.remove('hidden');
    return;
  }

  const isMyTurn = (state.gameState?.currentTurnPlayerId === state.playerId);
  const phase = state.gameState?.phase;

  cards.forEach((card, idx) => {
    const row = document.createElement('div');
    row.className = 'dev-card-row';

    const cardName = DEV_CARD_NAMES[card.type] || card.type;
    const canPlay = !card.isPlayed && isMyTurn && (card.turnBought < state.gameState.turnNumber) && (phase === 'TURN_MAIN' || (card.type === 'knight' && phase === 'TURN_ROLL'));

    row.innerHTML = `
      <div class="dev-card-info">
        <h4>${cardName}</h4>
        <p>${card.isPlayed ? 'Đã sử dụng' : (card.turnBought === state.gameState?.turnNumber ? 'Mua trong lượt này (chưa được đánh)' : 'Sẵn sàng sử dụng')}</p>
      </div>
      <div>
        ${card.type !== 'victory_point' && !card.isPlayed ? `
          <button class="btn btn-sm btn-primary btn-play-card" data-idx="${idx}" ${!canPlay ? 'disabled' : ''}>
            Đánh thẻ
          </button>
        ` : ''}
      </div>
    `;

    const playBtn = row.querySelector('.btn-play-card');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (card.type === 'knight') {
          emitAsync('game:play_knight').then(res => {
            if (!res.success) alert(res.error);
            else modalDevCards.classList.add('hidden');
          });
        } else if (card.type === 'year_of_plenty') {
          yearOfPlentySelector.classList.remove('hidden');
        } else if (card.type === 'monopoly') {
          monopolySelector.classList.remove('hidden');
        }
      });
    }

    myDevCardsList.appendChild(row);
  });

  modalDevCards.classList.remove('hidden');
}

// ========================================================
// HỆ THỐNG ÂM THANH XÚC XẮC THUẦN (WEB AUDIO API)
// ========================================================

class DiceSoundEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playRollSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Nhịp nảy lách cách của 2 viên xúc xắc chạm khay gỗ và chạm vào nhau
      const tapTimings = [0.0, 0.12, 0.28, 0.45, 0.68, 0.9, 1.1];
      tapTimings.forEach((t, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(750 + Math.random() * 450, now + t);
        filter.Q.setValueAtTime(3.5, now + t);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220 + Math.random() * 90, now + t);
        osc.frequency.exponentialRampToValueAtTime(70, now + t + 0.04);

        const decayTime = (i === tapTimings.length - 1) ? 0.08 : 0.045;
        const vol = (1 - (i / tapTimings.length) * 0.45) * 0.28;
        gain.gain.setValueAtTime(vol, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + decayTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + t);
        osc.stop(now + t + decayTime + 0.01);
      });
    } catch {
      // Bỏ qua nếu trình duyệt chặn Autoplay Audio
    }
  }
}

const diceAudio = new DiceSoundEngine();

// ========================================================
// HỆ THỐNG XÚC XẮC 3D CATAN (CSS 3D REALISTIC ENGINE)
// ========================================================

const DICE_FACE_ANGLES = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 }
};

const dice3DState = {
  rotations: {
    die1: { x: 0, y: 0 },
    die2: { x: 0, y: 0 }
  }
};

function triggerPreRollAnimation() {
  diceAudio.playRollSound();

  if (dieWrapper1) {
    dieWrapper1.classList.remove('rolling');
    void dieWrapper1.offsetWidth;
    dieWrapper1.classList.add('rolling');
  }
  if (dieWrapper2) {
    dieWrapper2.classList.remove('rolling');
    void dieWrapper2.offsetWidth;
    dieWrapper2.classList.add('rolling');
  }

  if (diceScoreText) {
    diceScoreText.textContent = '🎲 Đang gieo...';
  }
  if (diceScoreBanner) {
    diceScoreBanner.className = 'dice-score-banner';
  }
}

function render3DDiceResult(val1, val2, animate = true) {
  if (!val1 || !val2 || !diceCube1 || !diceCube2) return;

  const v1 = Math.max(1, Math.min(6, parseInt(val1, 10)));
  const v2 = Math.max(1, Math.min(6, parseInt(val2, 10)));
  const sum = v1 + v2;

  const target1 = DICE_FACE_ANGLES[v1] || { x: 0, y: 0 };
  const target2 = DICE_FACE_ANGLES[v2] || { x: 0, y: 0 };

  if (animate) {
    sound.playDice();
    diceAudio.playRollSound();

    if (dieWrapper1) {
      dieWrapper1.classList.remove('rolling');
      void dieWrapper1.offsetWidth;
      dieWrapper1.classList.add('rolling');
    }
    if (dieWrapper2) {
      dieWrapper2.classList.remove('rolling');
      void dieWrapper2.offsetWidth;
      dieWrapper2.classList.add('rolling');
    }

    // Tích lũy 3 vòng quay trọn vẹn (1080deg) để luôn quay xuôi mượt mà
    const extraSpins = 1080;

    dice3DState.rotations.die1.x = Math.ceil(dice3DState.rotations.die1.x / 360) * 360 + extraSpins + target1.x;
    dice3DState.rotations.die1.y = Math.ceil(dice3DState.rotations.die1.y / 360) * 360 + extraSpins + target1.y;

    dice3DState.rotations.die2.x = Math.ceil(dice3DState.rotations.die2.x / 360) * 360 + extraSpins + target2.x;
    dice3DState.rotations.die2.y = Math.ceil(dice3DState.rotations.die2.y / 360) * 360 + extraSpins + target2.y;

    diceCube1.style.transform = `rotateX(${dice3DState.rotations.die1.x}deg) rotateY(${dice3DState.rotations.die1.y}deg)`;
    diceCube2.style.transform = `rotateX(${dice3DState.rotations.die2.x}deg) rotateY(${dice3DState.rotations.die2.y}deg)`;

    // Cập nhật banner điểm sau khi xúc xắc dừng
    setTimeout(() => {
      updateDiceScoreBanner(sum, v1, v2);
    }, 1100);
  } else {
    // Không animate: đặt góc trực tiếp
    dice3DState.rotations.die1.x = target1.x;
    dice3DState.rotations.die1.y = target1.y;
    dice3DState.rotations.die2.x = target2.x;
    dice3DState.rotations.die2.y = target2.y;

    diceCube1.style.transform = `rotateX(${target1.x}deg) rotateY(${target1.y}deg)`;
    diceCube2.style.transform = `rotateX(${target2.x}deg) rotateY(${target2.y}deg)`;

    updateDiceScoreBanner(sum, v1, v2);
  }
}

function updateDiceScoreBanner(sum, v1, v2) {
  if (!diceScoreBanner || !diceScoreText) return;

  diceScoreBanner.classList.remove('score-pop', 'is-seven', 'is-red-token');
  void diceScoreBanner.offsetWidth;
  diceScoreBanner.classList.add('score-pop');

  if (sum === 7) {
    diceScoreBanner.classList.add('is-seven');
    diceScoreText.innerHTML = `⚠️ Tên cướp (7) &bull; <small>(${v1} + ${v2})</small>`;
  } else if (sum === 6 || sum === 8) {
    diceScoreBanner.classList.add('is-red-token');
    diceScoreText.innerHTML = `⭐ Tổng: ${sum} &bull; <small>(${v1} + ${v2})</small>`;
  } else {
    diceScoreText.innerHTML = `🎲 Tổng: ${sum} &bull; <small>(${v1} + ${v2})</small>`;
  }
}

// ========================================================
// HÀNH ĐỘNG GIEO XÚC XẮC CHUNG
// ========================================================

async function handleRollDiceAction() {
  btnRollDice.disabled = true;
  triggerPreRollAnimation();
  try {
    const res = await emitAsync('game:roll_dice');
    if (!res.success) alert(res.error);
  } catch (err) {
    alert(err.message);
  }
}

// ========================================================
// SẢNH CHỜ & PHÒNG CHƠI (LOBBY)
// ========================================================

function renderPlayerSlots(room) {
  if (!room || !room.players) return;

  // Phát âm thanh khi có người chơi khác trong phòng đổi màu
  if (state.prevLobbyColors && state.prevLobbyColors[room.id]) {
    const prevMap = state.prevLobbyColors[room.id];
    (room.players || []).forEach(p => {
      if (p.id !== state.playerId && prevMap[p.id] && p.color?.hex && prevMap[p.id].toLowerCase() !== p.color.hex.toLowerCase()) {
        sound.playColorChange(p.color.hex);
        addLog(`${p.name} đã đổi sang màu ${p.color?.name || p.color.hex}`, 'info');
      }
    });
  }
  if (!state.prevLobbyColors) state.prevLobbyColors = {};
  state.prevLobbyColors[room.id] = {};
  (room.players || []).forEach(p => {
    if (p && p.id && p.color?.hex) {
      state.prevLobbyColors[room.id][p.id] = p.color.hex;
    }
  });

  state.room = room;
  playerCount.textContent = room.players.length;
  playerList.innerHTML = '';

  const isHost = room.hostId === state.playerId;
  state.isHost = isHost;

  // Cập nhật trạng thái bản đồ và quyền điều khiển map của chủ phòng trong sảnh chờ
  const isRandom = (room.boardMode === 'RANDOM');
  if (lobbyBoardBadge) {
    lobbyBoardBadge.textContent = isRandom ? '🎲 Bản đồ Ngẫu nhiên' : '🗺️ Bản đồ Tiêu chuẩn';
    lobbyBoardBadge.classList.toggle('random-mode', isRandom);
  }
  if (toggleRandomBoard) {
    toggleRandomBoard.checked = isRandom;
    toggleRandomBoard.disabled = !isHost;
  }
  if (btnRerollRandomBoard) {
    btnRerollRandomBoard.style.display = (isHost && isRandom) ? 'inline-flex' : 'none';
  }
  if (lobbyHostMapActions) {
    lobbyHostMapActions.style.display = isHost ? 'flex' : 'none';
  }

  const availableColors = room.availableColors || [
    { name: 'Đỏ', hex: '#e74c3c' },
    { name: 'Xanh dương', hex: '#3498db' },
    { name: 'Cam', hex: '#e67e22' },
    { name: 'Trắng', hex: '#ecf0f1' },
    { name: 'Xanh lá', hex: '#2ecc71' },
    { name: 'Tím', hex: '#9b59b6' }
  ];

  for (let i = 0; i < 4; i++) {
    const player = room.players[i];
    const slot = document.createElement('div');

    if (player) {
      const isMe = player.id === state.playerId;
      slot.className = `player-slot ${isMe ? 'me' : ''}`;

      let colorPickerHtml = '';
      if (isMe) {
        const otherPlayerHexes = room.players
          .filter(p => p.id !== player.id)
          .map(p => p.color?.hex?.toLowerCase());

        const swatchesHtml = availableColors.map(c => {
          const isSelected = player.color?.hex?.toLowerCase() === c.hex.toLowerCase();
          const isTaken = otherPlayerHexes.includes(c.hex.toLowerCase());
          const title = isSelected
            ? `Màu hiện tại của bạn: ${c.name}`
            : (isTaken ? `Đã có người chơi khác chọn màu ${c.name}` : `Đổi sang màu ${c.name}`);

          return `
            <span class="color-swatch-item ${isSelected ? 'active' : ''} ${isTaken ? 'disabled' : ''}"
                  style="background-color: ${c.hex};"
                  data-color-hex="${c.hex}"
                  title="${escapeHtml(title)}">
              ${isSelected ? '✓' : ''}
            </span>
          `;
        }).join('');

        colorPickerHtml = `
          <div class="player-color-picker-box">
            <span class="color-picker-title">Đổi màu quân của bạn:</span>
            <div class="color-swatches-row">
              ${swatchesHtml}
            </div>
          </div>
        `;
      }

      slot.innerHTML = `
        <div class="player-slot-main">
          <span class="player-color-dot" style="background-color: ${player.color?.hex || '#999'}"></span>
          <div class="player-info">
            <span class="player-name">${escapeHtml(player.name)} ${isMe ? '(Bạn)' : ''}</span>
            <span class="player-role">${player.isHost ? '★ Chủ phòng' : 'Người chơi'}</span>
          </div>
        </div>
        ${colorPickerHtml}
      `;

      if (isMe) {
        slot.querySelectorAll('.color-swatch-item:not(.disabled):not(.active)').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const colorHex = btn.getAttribute('data-color-hex');
            try {
              sound.playBop();
              const res = await emitAsync('room:change_color', { colorHex });
              if (!res.success) {
                sound.playFail();
                alert(res.error);
              } else {
                sound.playColorChange(colorHex);
                addLog(`Bạn đã đổi màu sang ${res.player?.color?.name || colorHex}`, 'info');
              }
            } catch (err) {
              sound.playFail();
              alert(err.message);
            }
          });
        });

        // Phản hồi khi người dùng bấm vào màu đã có người khác chọn
        slot.querySelectorAll('.color-swatch-item.disabled').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            sound.playFail();
            addLog('Màu này đã có người chơi khác chọn, vui lòng chọn màu khác!', 'warning');
          });
        });
      }
    } else {
      slot.className = 'player-slot empty';
      slot.innerHTML = `<span>+ Đang chờ người chơi...</span>`;
    }

    playerList.appendChild(slot);
  }

  // Đồng bộ đầy đủ 4 vị trí người chơi lên bàn cờ
  renderLobbyPlayersOnBoard(room);

  if (isHost) {
    if (room.players.length >= 2) {
      btnStartGame.disabled = false;
      waitingNote.textContent = 'Đã đủ số người chơi tối thiểu để bắt đầu ván!';
      waitingNote.style.color = '#2ecc71';
    } else {
      btnStartGame.disabled = true;
      waitingNote.textContent = 'Cần ít nhất 2 người chơi để bắt đầu (khuyên dùng 3–4 người). Bạn có thể đổi màu hoặc random map.';
      waitingNote.style.color = '';
    }
  } else {
    btnStartGame.disabled = true;
    waitingNote.textContent = 'Chỉ có chủ phòng mới có thể bắt đầu trò chơi và đổi bản đồ.';
    waitingNote.style.color = '';
  }
}

function showRoomView(room) {
  state.room = room;
  state.roomId = room.id;
  displayRoomId.textContent = room.id;

  joinCard.classList.add('hidden');
  roomCard.classList.remove('hidden');

  renderPlayerSlots(room);
  saveSession();
}

function showJoinView() {
  state.room = null;
  state.roomId = null;
  state.gameState = null;
  state.playerId = null;
  state.sessionToken = null;
  state.isHost = false;
  clearSession();

  document.body.classList.remove('in-game-mode');
  lobbySection.classList.remove('hidden');
  roomCard.classList.add('hidden');
  joinCard.classList.remove('hidden');

  if (lobbyBoardBadge) {
    lobbyBoardBadge.textContent = '🗺️ Bản đồ Tiêu chuẩn';
    lobbyBoardBadge.classList.remove('random-mode');
  }
  if (toggleRandomBoard) {
    toggleRandomBoard.checked = false;
  }
  if (btnRerollRandomBoard) {
    btnRerollRandomBoard.style.display = 'none';
  }

  fetch('/api/board/standard')
    .then(r => r.json())
    .then(b => renderBoard(b))
    .catch(() => {});

  // Đặt lại 4 vị trí người chơi tiêu chuẩn trên bàn cờ
  renderLeftPlayersPanel(null);
}

// ========================================================
// KHỞI TẠO ỨNG DỤNG & SỰ KIỆN GIAO DIỆN (INIT & EVENT LISTENERS)
// ========================================================

async function init() {
  // 1. Tải bản đồ tiêu chuẩn ban đầu
  try {
    const res = await fetch('/api/board/standard');
    const boardData = await res.json();
    renderBoard(boardData);
  } catch (err) {
    console.error('Lỗi tải bản đồ ban đầu:', err);
  }

  // Luôn hiển thị đầy đủ 4 vị trí người chơi trên bàn cờ từ đầu
  renderLeftPlayersPanel(null);

  // 2. Khởi tạo Kéo-Thả Quân cờ và Kéo-Thả Di chuyển Tab tự do
  setupDragAndDrop();
  setupDraggableTabs();

  // 3. Khởi tạo Socket.IO
  initSocket({
    onConnect: (id) => {
      state.socketId = id;
      updateConnectionStatus('connected', 'Đã kết nối');
      addLog(`Kết nối thành công tới Server (Socket ID: ${id})`, 'success');
      updatePing();

      // F5 Auto-Reconnect
      const savedSession = sessionStorage.getItem('catan_session');
      if (savedSession) {
        try {
          const sess = JSON.parse(savedSession);
          if (sess.playerId) state.playerId = sess.playerId;
          if (sess.playerName) state.playerName = sess.playerName;
          if (sess.roomId) state.roomId = sess.roomId;
          if (sess.sessionToken) state.sessionToken = sess.sessionToken;

          if (sess.roomId && sess.sessionToken) {
            emitAsync('player:reconnect', { roomId: sess.roomId, sessionToken: sess.sessionToken })
              .then(res => {
                if (res.success) {
                  state.playerId = res.player.id;
                  state.playerName = res.player.name;
                  state.isHost = res.player.isHost;
                  state.sessionToken = res.player.sessionToken;
                  saveSession();

                  const isGameActive = Boolean(
                    res.room?.status === 'PLAYING' ||
                    state.gameState ||
                    (res.room?.status && res.room.status !== 'WAITING')
                  );

                  if (isGameActive) {
                    document.body.classList.add('in-game-mode');
                    lobbySection.classList.add('hidden');
                    if (state.gameState) {
                      updateGameHud(state.gameState);
                    }
                  } else {
                    showRoomView(res.room);
                  }
                  addLog(`Đã khôi phục thành công phiên chơi phòng [${res.room.id}]!`, 'success');
                } else {
                  clearSession();
                  showJoinView();
                }
              })
              .catch(() => {
                clearSession();
                showJoinView();
              });
          }
        } catch {
          clearSession();
        }
      }
    },
    onDisconnect: (reason) => {
      updateConnectionStatus('disconnected', 'Mất kết nối');
      addLog(`Mất kết nối máy chủ: ${reason}`, 'error');
    },
    onConnectError: (err) => {
      updateConnectionStatus('disconnected', 'Lỗi kết nối');
      addLog(`Không thể kết nối máy chủ: ${err.message}`, 'error');
    },
    onRoomState: (roomState) => {
      renderPlayerSlots(roomState);
      if (roomState.board && !state.gameState) {
        renderBoard(roomState.board);
      }
    },
    onGameState: (gameState) => {
      updateGameHud(gameState);
    },
    onTradeProposal: (tradeOffer) => {
      handleIncomingTradeProposal(tradeOffer);
    },
    onTradeUpdate: (tradeUpdate) => {
      handleTradeUpdate(tradeUpdate);
    }
  });

  // 4. Các nút điều khiển Zoom bản đồ (Pan/Zoom Toolbar)
  btnZoomIn.addEventListener('click', () => {
    state.boardRenderer?.zoomIn();
  });
  btnZoomOut.addEventListener('click', () => {
    state.boardRenderer?.zoomOut();
  });
  btnZoomReset.addEventListener('click', () => {
    state.boardRenderer?.resetZoom();
  });

  // 4B. Hệ thống Điều Chỉnh Âm Lượng (Volume Sliders, Mute & Presets)
  const btnToggleSoundHeader = document.getElementById('btnToggleSoundHeader');
  const btnToggleSoundBoard = document.getElementById('btnToggleSoundBoard');
  const soundIconHeader = document.getElementById('soundIconHeader');
  const soundTextHeader = document.getElementById('soundTextHeader');
  const headerVolumePopover = document.getElementById('headerVolumePopover');
  const boardVolumePopover = document.getElementById('boardVolumePopover');

  const volumeSliderHeader = document.getElementById('volumeSliderHeader');
  const volumeSliderBoard = document.getElementById('volumeSliderBoard');
  const volumePercentHeader = document.getElementById('volumePercentHeader');
  const volumePercentBoard = document.getElementById('volumePercentBoard');
  const btnQuickMuteHeader = document.getElementById('btnQuickMuteHeader');
  const btnQuickMuteBoard = document.getElementById('btnQuickMuteBoard');

  let testSoundDebounce = null;

  function updateSoundUI({ muted, volume }) {
    const isMuted = Boolean(muted || (volume !== undefined && volume <= 0.001));
    const currentVol = (volume !== undefined) ? volume : sound.getVolume();
    const volPercent = Math.round(currentVol * 100);
    const icon = isMuted ? '🔇' : (volPercent < 35 ? '🔈' : (volPercent < 70 ? '🔉' : '🔊'));

    if (soundIconHeader) soundIconHeader.textContent = icon;
    if (soundTextHeader) soundTextHeader.textContent = isMuted ? 'Tắt tiếng' : `${volPercent}%`;

    if (btnSettingsMute) {
      btnSettingsMute.textContent = icon;
      btnSettingsMute.classList.toggle('muted', isMuted);
    }

    if (settingsVolumeSlider) {
      settingsVolumeSlider.value = isMuted ? 0 : volPercent;
    }

    if (settingsVolumePercent) {
      settingsVolumePercent.textContent = isMuted ? '0%' : `${volPercent}%`;
    }

    // Cập nhật trạng thái active của các nút preset
    document.querySelectorAll('.btn-vol-preset').forEach(btn => {
      const presetVal = parseInt(btn.getAttribute('data-vol'), 10);
      btn.classList.toggle('active', !isMuted && Math.abs(presetVal - volPercent) <= 5);
    });
  }

  sound.onChange(updateSoundUI);
  updateSoundUI({ muted: sound.isMuted(), volume: sound.getVolume() });

  // Nút bật / tắt tiếng trong Cài Đặt
  btnSettingsMute?.addEventListener('click', () => {
    sound.toggleMute();
    sound.playBop();
  });

  // Kéo thanh trượt âm lượng trong Cài Đặt
  settingsVolumeSlider?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    sound.setVolume(val / 100);

    clearTimeout(testSoundDebounce);
    testSoundDebounce = setTimeout(() => {
      sound.playBop();
    }, 150);
  });

  // Các nút chọn mức âm lượng nhanh (0%, 30%, 65%, 100%)
  document.querySelectorAll('.btn-vol-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = parseInt(btn.getAttribute('data-vol'), 10);
      sound.setVolume(val / 100);
      sound.playBop();
    });
  });

  // 5. Cài Đặt Trò Chơi (Settings Modal Wiring)
  applyHandViewMode();

  btnOpenSettingsHeader?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSettingsModal();
  });

  btnOpenSettingsBoard?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSettingsModal();
  });

  btnCloseSettingsModal?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettingsModal();
  });

  modalSettings?.addEventListener('click', (e) => {
    if (e.target === modalSettings) {
      closeSettingsModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalSettings && !modalSettings.classList.contains('hidden')) {
      closeSettingsModal();
    }
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        sortAndAlignCards();
      }
    }
  });

  // Nút Xếp gọn các lá bài (Sort Cards)
  btnSortCards?.addEventListener('click', () => {
    sortAndAlignCards();
  });

  // Chuyển đổi chế độ túi thẻ qua Radio Card trong Cài Đặt
  document.querySelectorAll('input[name="handViewModeRadio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setHandViewMode(e.target.value);
    });
  });

  // Nút Đặt lại góc nhìn bàn cờ trong Cài Đặt
  btnSettingsResetZoom?.addEventListener('click', () => {
    sound.playBop();
    state.boardRenderer?.resetZoom();
    closeSettingsModal();
  });

  // Nút Thoát game / Rời phòng trong Cài Đặt
  btnSettingsLeaveGame?.addEventListener('click', async () => {
    sound.playBop();
    const confirmed = confirm('Bạn có chắc chắn muốn rời phòng / thoát ván chơi hiện tại và quay về sảnh chính không?');
    if (!confirmed) return;

    closeSettingsModal();
    btnSettingsLeaveGame.disabled = true;
    try {
      await emitAsync('room:leave');
    } catch (err) {
      console.warn('Lỗi khi rời phòng:', err);
    } finally {
      btnSettingsLeaveGame.disabled = false;
      showJoinView();
      addLog('Bạn đã thoát khỏi ván đấu và quay về sảnh chờ.', 'system');
    }
  });

  // 6. Ping & Logs
  btnPing.addEventListener('click', async () => {
    btnPing.disabled = true;
    await updatePing();
    addLog(`Ping kiểm tra độ trễ: ${latencyValue.textContent}ms`, 'system');
    btnPing.disabled = false;
  });

  btnClearLog.addEventListener('click', () => {
    logContainer.innerHTML = '';
  });

  let isLogCollapsed = false;
  function toggleLogCollapse(forceState = null) {
    isLogCollapsed = (forceState !== null) ? forceState : !isLogCollapsed;
    if (isLogCollapsed) {
      floatingLogDrawer?.classList.add('collapsed');
      if (logToggleIcon) logToggleIcon.textContent = '▲';
      if (logToggleLabel) logToggleLabel.textContent = 'Mở rộng';
    } else {
      floatingLogDrawer?.classList.remove('collapsed');
      if (logToggleIcon) logToggleIcon.textContent = '▼';
      if (logToggleLabel) logToggleLabel.textContent = 'Thu gọn';
    }
  }

  btnToggleLogDrawer?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLogCollapse();
  });

  logHeader?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    toggleLogCollapse();
  });

  document.getElementById('btnToggleBoardView')?.addEventListener('click', () => {
    document.getElementById('gameSection')?.scrollIntoView({ behavior: 'smooth' });
  });

  // 7. Tạo & Vào phòng
  btnCreateRoom.addEventListener('click', async () => {
    sound.playBop();
    const name = playerNameInput.value.trim() || 'Người chơi';
    state.playerName = name;
    localStorage.setItem('catan_player_name', name);

    btnCreateRoom.disabled = true;
    try {
      const res = await emitAsync('room:create', { playerName: name });
      if (res.success) {
        state.playerId = res.player.id;
        state.sessionToken = res.player.sessionToken;
        state.isHost = res.player.isHost;
        addLog(`Đã tạo phòng [${res.room.id}]`, 'success');
        showRoomView(res.room);
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert(err.message || 'Không thể kết nối máy chủ Catan. Vui lòng kiểm tra kết nối mạng và thử lại!');
    } finally {
      btnCreateRoom.disabled = false;
    }
  });

  btnJoinRoom.addEventListener('click', async () => {
    const name = playerNameInput.value.trim() || 'Người chơi';
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) return alert('Vui lòng nhập mã phòng!');

    state.playerName = name;
    localStorage.setItem('catan_player_name', name);

    btnJoinRoom.disabled = true;
    try {
      const res = await emitAsync('room:join', { roomId: code, playerName: name });
      if (res.success) {
        state.playerId = res.player.id;
        state.sessionToken = res.player.sessionToken;
        state.isHost = res.player.isHost;
        addLog(`Đã tham gia phòng [${res.room.id}]`, 'success');
        showRoomView(res.room);
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btnJoinRoom.disabled = false;
    }
  });

  btnLeaveRoom.addEventListener('click', async () => {
    sound.playBop();
    btnLeaveRoom.disabled = true;
    try {
      await emitAsync('room:leave');
    } catch (err) {
      console.warn('Lỗi khi rời phòng:', err);
    } finally {
      btnLeaveRoom.disabled = false;
      showJoinView();
    }
  });

  btnCopyInvite.addEventListener('click', async () => {
    if (!state.roomId) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      btnCopyInvite.textContent = '✓ Đã sao chép!';
      setTimeout(() => { btnCopyInvite.textContent = '📋 Sao chép link mời'; }, 2000);
    } catch {
      prompt('Sao chép liên kết mời:', inviteUrl);
    }
  });

  // Bật / Tắt chế độ Bản đồ ngẫu nhiên bằng Toggle Switch (Chỉ chủ phòng)
  toggleRandomBoard?.addEventListener('change', async () => {
    if (!state.isHost) return;
    const isChecked = toggleRandomBoard.checked;
    sound.playBop();
    toggleRandomBoard.disabled = true;
    try {
      const res = await emitAsync('room:toggle_board_mode', { isRandom: isChecked });
      if (!res.success) {
        sound.playFail();
        alert(res.error);
        toggleRandomBoard.checked = !isChecked;
      } else {
        sound.playSuccess();
        const modeName = isChecked ? 'Bản đồ Ngẫu nhiên' : 'Bản đồ Tiêu chuẩn';
        addLog(`Chủ phòng đã chuyển sang [${modeName}]`, 'event');
      }
    } catch (err) {
      sound.playFail();
      alert(err.message);
      toggleRandomBoard.checked = !isChecked;
    } finally {
      toggleRandomBoard.disabled = !state.isHost;
    }
  });

  // Sinh lại bản đồ ngẫu nhiên khác khi đang ở chế độ Random (Chỉ chủ phòng)
  btnRerollRandomBoard?.addEventListener('click', async () => {
    if (!state.isHost) return;
    btnRerollRandomBoard.disabled = true;
    sound.playBop();
    try {
      const res = await emitAsync('room:randomize_board');
      if (!res.success) {
        sound.playFail();
        alert(res.error);
      } else {
        sound.playSuccess();
        addLog('Chủ phòng đã sinh lại Bản đồ ngẫu nhiên mới!', 'event');
      }
    } catch (err) {
      sound.playFail();
      alert(err.message);
    } finally {
      btnRerollRandomBoard.disabled = false;
    }
  });

  btnStartGame.addEventListener('click', async () => {
    btnStartGame.disabled = true;
    sound.play('start-end');
    try {
      const res = await emitAsync('game:start');
      if (!res.success) {
        sound.playFail();
        alert(res.error);
      }
    } catch (err) {
      sound.playFail();
      alert(err.message);
    } finally {
      btnStartGame.disabled = false;
    }
  });

  // 8. Xúc xắc & Kết thúc lượt
  btnRollDice.addEventListener('click', handleRollDiceAction);
  document.getElementById('diceTray')?.addEventListener('click', () => {
    if (!btnRollDice.disabled) {
      handleRollDiceAction();
    }
  });

  btnEndTurn.addEventListener('click', async () => {
    const isMyTurn = (state.gameState?.currentTurnPlayerId === state.playerId);
    const phase = state.gameState?.phase;
    if (!isMyTurn || phase !== 'TURN_MAIN' || btnEndTurn.disabled) {
      return;
    }

    btnEndTurn.disabled = true;
    btnEndTurn.classList.add('disabled');
    sound.playBop();
    try {
      const res = await emitAsync('game:end_turn');
      if (!res.success) {
        sound.playFail();
        if (res.error) addLog(res.error, 'error');
        if (state.gameState?.currentTurnPlayerId === state.playerId && state.gameState?.phase === 'TURN_MAIN') {
          btnEndTurn.disabled = false;
          btnEndTurn.classList.remove('disabled');
        }
      }
    } catch (err) {
      sound.playFail();
      if (err.message) addLog(err.message, 'error');
      if (state.gameState?.currentTurnPlayerId === state.playerId && state.gameState?.phase === 'TURN_MAIN') {
        btnEndTurn.disabled = false;
        btnEndTurn.classList.remove('disabled');
      }
    }
  });

  btnBuyDevCard?.addEventListener('click', async () => {
    try {
      const res = await emitAsync('game:buy_dev_card');
      if (!res.success) {
        sound.playFail();
        alert(res.error);
      } else {
        sound.playCardDraw();
        addLog('Bạn đã mua 1 thẻ phát triển bí mật!', 'success');
      }
    } catch (err) {
      sound.playFail();
      alert(err.message);
    }
  });

  // 9A. Giao dịch Ngân hàng (Dedicated 4:1 Bank Trade Modal)
  btnCloseBankTradeModal?.addEventListener('click', () => {
    modalBankTrade.classList.add('hidden');
  });

  bankTradeGiveSelect?.addEventListener('change', updateBankTradeInfo);
  bankTradeGetSelect?.addEventListener('change', updateBankTradeInfo);

  btnExecuteBankTrade?.addEventListener('click', async () => {
    const giveResource = bankTradeGiveSelect.value;
    const getResource = bankTradeGetSelect.value;
    btnExecuteBankTrade.disabled = true;
    try {
      const res = await emitAsync('game:trade_bank', { giveResource, getResource });
      if (!res.success) {
        alert(res.error);
      } else {
        addLog(`Đã đổi 4 ${RESOURCE_NAMES[giveResource]} lấy 1 ${RESOURCE_NAMES[getResource]} với Ngân hàng!`, 'success');
        modalBankTrade.classList.add('hidden');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btnExecuteBankTrade.disabled = false;
    }
  });

  // 9B. Giao dịch Cảng Biển (Dedicated Port Trade Modal - 2:1 hoặc 3:1)
  btnClosePortTradeModal?.addEventListener('click', () => {
    modalPortTrade.classList.add('hidden');
    currentActivePort = null;
  });

  portTradeGiveSelect?.addEventListener('change', updatePortTradeInfo);
  portTradeGetSelect?.addEventListener('change', updatePortTradeInfo);

  btnExecutePortTrade?.addEventListener('click', async () => {
    if (!currentActivePort) return;
    const isSpecialized = (currentActivePort.type !== '3:1' && currentActivePort.type !== 'generic');
    const ratio = isSpecialized ? 2 : 3;
    const giveResource = isSpecialized ? currentActivePort.type : portTradeGiveSelect.value;
    const getResource = portTradeGetSelect.value;

    btnExecutePortTrade.disabled = true;
    try {
      const res = await emitAsync('game:trade_bank', { giveResource, getResource });
      if (!res.success) {
        alert(res.error);
      } else {
        addLog(`Đã đổi ${ratio} ${RESOURCE_NAMES[giveResource]} lấy 1 ${RESOURCE_NAMES[getResource]} qua Cảng!`, 'success');
        modalPortTrade.classList.add('hidden');
        currentActivePort = null;
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btnExecutePortTrade.disabled = false;
    }
  });

  // Giao dịch giữa người chơi (Player-to-Player Targeted Trade Modal)
  btnClosePlayerTradeModal?.addEventListener('click', () => {
    modalPlayerTrade.classList.add('hidden');
  });

  // Nút tăng/giảm số lượng giao dịch giữa người chơi
  document.querySelectorAll('#modalPlayerTrade .res-counter-row').forEach(row => {
    const res = row.getAttribute('data-res');
    const isGive = row.closest('.domestic-col').querySelector('h4').textContent.includes('đưa ra');

    row.querySelector('.btn-dec').addEventListener('click', () => {
      const targetObj = isGive ? domesticTradeState.give : domesticTradeState.receive;
      if (targetObj[res] > 0) {
        targetObj[res]--;
        updateDomesticTradeUI();
      }
    });

    row.querySelector('.btn-inc').addEventListener('click', () => {
      const targetObj = isGive ? domesticTradeState.give : domesticTradeState.receive;
      const oppositeObj = isGive ? domesticTradeState.receive : domesticTradeState.give;

      if (oppositeObj[res] > 0) return;

      if (isGive) {
        const myRes = state.gameState?.players[state.playerId]?.resources || {};
        if (targetObj[res] < (myRes[res] || 0)) {
          targetObj[res]++;
        }
      } else {
        if (targetObj[res] < 5) targetObj[res]++;
      }
      updateDomesticTradeUI();
    });
  });

  btnSendPlayerTradeOffer?.addEventListener('click', async () => {
    btnSendPlayerTradeOffer.disabled = true;
    try {
      const res = await emitAsync('game:trade_offer', {
        give: domesticTradeState.give,
        receive: domesticTradeState.receive,
        targetPlayerId: state.tradeTargetPlayerId
      });
      if (!res.success) {
        alert(res.error);
      } else {
        addLog(`Đã gửi đề xuất giao dịch tới ${playerTradeTargetName?.textContent || 'đối thủ'}!`, 'info');
        state.currentTradeOffer = res.tradeOffer;
        activeTradeStatusBox.classList.remove('hidden');
        renderLeftPlayersPanel(state.gameState);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btnSendPlayerTradeOffer.disabled = false;
    }
  });

  btnCancelActiveTrade?.addEventListener('click', async () => {
    await emitAsync('game:trade_cancel');
    activeTradeStatusBox.classList.add('hidden');
    state.currentTradeOffer = null;
    renderLeftPlayersPanel(state.gameState);
  });

  btnAcceptTradeProposal.addEventListener('click', async () => {
    modalTradeProposal.classList.add('hidden');
    await emitAsync('game:trade_respond', { accept: true });
  });

  btnRejectTradeProposal.addEventListener('click', async () => {
    modalTradeProposal.classList.add('hidden');
    await emitAsync('game:trade_respond', { accept: false });
  });

  // 10. Modal Bỏ bài ra số 7
  document.querySelectorAll('#modalDiscard .res-counter-row').forEach(row => {
    const res = row.getAttribute('data-res');
    row.querySelector('.btn-dec').addEventListener('click', () => {
      if (discardState[res] > 0) {
        discardState[res]--;
        updateDiscardUI();
      }
    });

    row.querySelector('.btn-inc').addEventListener('click', () => {
      const myRes = state.gameState?.players[state.playerId]?.resources || {};
      const totalSelected = Object.values(discardState).reduce((a, b) => a + b, 0);
      if (discardState[res] < (myRes[res] || 0) && totalSelected < currentDiscardRequired) {
        discardState[res]++;
        updateDiscardUI();
      }
    });
  });

  btnConfirmDiscard.addEventListener('click', async () => {
    btnConfirmDiscard.disabled = true;
    try {
      const res = await emitAsync('game:discard', { resources: discardState });
      if (!res.success) {
        alert(res.error);
        btnConfirmDiscard.disabled = false;
      } else {
        modalDiscard.classList.add('hidden');
      }
    } catch (err) {
      alert(err.message);
      btnConfirmDiscard.disabled = false;
    }
  });

  // 11. Modal Thẻ phát triển
  btnOpenDevCards.addEventListener('click', openDevCardsModal);
  btnCloseDevCardsModal.addEventListener('click', () => modalDevCards.classList.add('hidden'));

  btnConfirmYearOfPlenty.addEventListener('click', async () => {
    const res1 = yopRes1.value;
    const res2 = yopRes2.value;
    try {
      const res = await emitAsync('game:play_year_of_plenty', { res1, res2 });
      if (!res.success) alert(res.error);
      else {
        addLog(`Đã nhận 2 tài nguyên (${RESOURCE_NAMES[res1]}, ${RESOURCE_NAMES[res2]}) từ ngân hàng!`, 'success');
        modalDevCards.classList.add('hidden');
      }
    } catch (err) {
      alert(err.message);
    }
  });

  btnConfirmMonopoly.addEventListener('click', async () => {
    const targetResource = monopolyRes.value;
    try {
      const res = await emitAsync('game:play_monopoly', { targetResource });
      if (!res.success) alert(res.error);
      else {
        addLog(`Đã đánh Monopoly gom ${res.count} ${RESOURCE_NAMES[targetResource]} từ tất cả đối thủ!`, 'success');
        modalDevCards.classList.add('hidden');
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // 12. Modal Chiến thắng
  btnVictoryBackToLobby.addEventListener('click', () => {
    modalVictory.classList.add('hidden');
    showJoinView();
  });

  // 13. Toolbar Test Mode
  btnLoadStandard.addEventListener('click', async () => {
    const res = await fetch('/api/board/standard');
    renderBoard(await res.json());
  });

  btnGenerateRandom.addEventListener('click', async () => {
    const res = await fetch('/api/board/random');
    renderBoard(await res.json());
  });

  btnCycleColor.addEventListener('click', () => {
    if (state.boardInteractions) {
      const col = state.boardInteractions.cycleTestColor();
      currentColorDot.style.backgroundColor = col;
    }
  });

  btnClearPieces.addEventListener('click', () => {
    if (state.boardInteractions) state.boardInteractions.clearAllPieces();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
