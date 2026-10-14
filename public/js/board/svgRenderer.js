/**
 * SVG BOARD RENDERER
 * Vẽ toàn bộ bàn cờ Catan Classic bằng đồ họa vector SVG chuẩn.
 */

import {
  BOARD_CONFIG,
  TERRAIN_THEMES,
  PORT_THEMES,
  toSvgCoords,
  getHexPolygonPoints
} from './coordinates.js';

const NUMBER_PIPS = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1
};

export class SvgBoardRenderer {
  constructor(containerElement, boardData, options = {}) {
    this.container = containerElement;
    this.board = boardData;
    this.options = options; // { onVertexClick, onEdgeClick, onHexClick }

    this.svg = null;
    this.hexElements = new Map();
    this.vertexElements = new Map();
    this.edgeElements = new Map();
    this.portElements = new Map();
    this.robberElement = null;

    // Trạng thái Thu phóng (Zoom) & Kéo bàn (Pan)
    this.viewBox = {
      x: 0,
      y: 0,
      width: BOARD_CONFIG.BOARD_WIDTH,
      height: BOARD_CONFIG.BOARD_HEIGHT
    };
    this.initialViewBox = { ...this.viewBox };
    this.isPanning = false;
    this.startPan = { x: 0, y: 0 };
    this.startViewBox = { ...this.viewBox };

    this.render();
  }

  /**
   * Khởi tạo và render toàn bộ cấu trúc SVG
   */
  render() {
    this.container.innerHTML = '';

    const { BOARD_WIDTH, BOARD_HEIGHT, HEX_RADIUS } = BOARD_CONFIG;

    // Tạo thẻ SVG chính
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    this.svg.setAttribute('class', 'catan-board-svg');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Thêm các bộ lọc SVG (Drop Shadow, Gradients)
    this.renderSvgDefs();

    // 1. Lớp biển (Ocean background)
    this.renderOceanBackground();

    // 2. Lớp Cảng (Ports & Piers)
    this.renderPorts();

    // 3. Lớp 19 Lục giác (Hex tiles)
    this.renderHexes();

    // 4. Lớp Thẻ số (Number Tokens)
    this.renderNumberTokens();

    // 5. Lớp Tên cướp (Robber)
    this.renderRobber();

    // 6. Lớp Cạnh (72 Edges & Roads)
    this.renderEdges();

    // 7. Lớp Đỉnh (54 Vertices & Buildings)
    this.renderVertices();

    this.container.appendChild(this.svg);
    this.setupPanAndZoom();
  }

  /**
   * Định nghĩa các filter và gradients
   */
  renderSvgDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <!-- Bóng đổ cho Hex và Thẻ số -->
      <filter id="shadowHex" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.35"/>
      </filter>
      <filter id="shadowToken" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
      <!-- Màu nước biển -->
      <radialGradient id="oceanGrad" cx="50%" cy="50%" r="50%">
        <stop offset="60%" stop-color="#1a5276"/>
        <stop offset="100%" stop-color="#0e2f44"/>
      </radialGradient>
      <!-- Vành đai bờ biển Catan -->
      <radialGradient id="coastGrad" cx="50%" cy="50%" r="50%">
        <stop offset="68%" stop-color="#d4ac0d" stop-opacity="0.15"/>
        <stop offset="78%" stop-color="#2980b9" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#1a5276" stop-opacity="1"/>
      </radialGradient>

      <!-- Pattern cho Ảnh nền Biển (Ocean) -->
      <pattern id="pattern-ocean" patternUnits="userSpaceOnUse" width="850" height="750" x="0" y="0">
        <image href="/assets/ocean/ocean_background.png" width="850" height="750" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/ocean/ocean_background.svg')" />
      </pattern>

      <!-- Pattern cho 6 loại địa hình (Terrains) -->
      <pattern id="pattern-terrain-forest" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/forest.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/forest.svg')" />
      </pattern>
      <pattern id="pattern-terrain-hills" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/hills.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/hills.svg')" />
      </pattern>
      <pattern id="pattern-terrain-pasture" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/pasture.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/pasture.svg')" />
      </pattern>
      <pattern id="pattern-terrain-fields" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/fields.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/fields.svg')" />
      </pattern>
      <pattern id="pattern-terrain-mountains" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/mountains.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/mountains.svg')" />
      </pattern>
      <pattern id="pattern-terrain-desert" patternContentUnits="objectBoundingBox" width="1" height="1">
        <image href="/assets/terrains/desert.png" width="1" height="1" preserveAspectRatio="xMidYMid slice" onerror="this.setAttribute('href', '/assets/terrains/desert.svg')" />
      </pattern>
    `;
    this.svg.appendChild(defs);
  }

  /**
   * Vẽ nền biển bao quanh đảo
   */
  renderOceanBackground() {
    const oceanGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    oceanGroup.setAttribute('class', 'board-ocean');

    // Nước biển sử dụng ảnh pattern-ocean với fallback gradient
    const oceanCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    oceanCircle.setAttribute('cx', BOARD_CONFIG.CENTER_X);
    oceanCircle.setAttribute('cy', BOARD_CONFIG.CENTER_Y);
    oceanCircle.setAttribute('r', BOARD_CONFIG.HEX_RADIUS * 5.2);
    oceanCircle.setAttribute('fill', 'url(#pattern-ocean)');
    oceanGroup.appendChild(oceanCircle);

    // Vành sóng nước trang trí
    const waveRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    waveRing.setAttribute('cx', BOARD_CONFIG.CENTER_X);
    waveRing.setAttribute('cy', BOARD_CONFIG.CENTER_Y);
    waveRing.setAttribute('r', BOARD_CONFIG.HEX_RADIUS * 4.6);
    waveRing.setAttribute('fill', 'none');
    waveRing.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
    waveRing.setAttribute('stroke-width', '4');
    waveRing.setAttribute('stroke-dasharray', '12 8');
    oceanGroup.appendChild(waveRing);

    this.svg.appendChild(oceanGroup);
  }

  /**
   * Vẽ 9 Cảng trên các đỉnh ven biển
   */
  renderPorts() {
    const portsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    portsGroup.setAttribute('class', 'board-ports');

    this.board.ports.forEach(port => {
      const v1 = this.board.vertices[port.vertexIds[0]];
      const v2 = this.board.vertices[port.vertexIds[1]];
      const p1 = toSvgCoords(v1.x, v1.y);
      const p2 = toSvgCoords(v2.x, v2.y);

      // Điểm trung tâm giữa 2 đỉnh
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      // Vector hướng ra phía ngoài biển từ tâm đảo
      const dx = midX - BOARD_CONFIG.CENTER_X;
      const dy = midY - BOARD_CONFIG.CENTER_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = 42; // Đẩy cảng ra xa đảo 42px
      const portX = midX + (dx / dist) * offset;
      const portY = midY + (dy / dist) * offset;

      const theme = PORT_THEMES[port.type] || PORT_THEMES.generic;

      const portItem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      portItem.setAttribute('class', `port-item port-${port.type}`);
      portItem.setAttribute('data-port-id', port.id);
      portItem.setAttribute('data-port-type', port.type);
      portItem.style.cursor = 'pointer';
      portItem.style.pointerEvents = 'all';

      // 2 cầu tàu nối từ 2 đỉnh ra biểu tượng cảng
      const pier1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pier1.setAttribute('x1', p1.x);
      pier1.setAttribute('y1', p1.y);
      pier1.setAttribute('x2', portX);
      pier1.setAttribute('y2', portY);
      pier1.setAttribute('stroke', '#a0522d');
      pier1.setAttribute('stroke-width', '4');
      pier1.setAttribute('stroke-linecap', 'round');
      portItem.appendChild(pier1);

      const pier2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pier2.setAttribute('x1', p2.x);
      pier2.setAttribute('y1', p2.y);
      pier2.setAttribute('x2', portX);
      pier2.setAttribute('y2', portY);
      pier2.setAttribute('stroke', '#a0522d');
      pier2.setAttribute('stroke-width', '4');
      pier2.setAttribute('stroke-linecap', 'round');
      portItem.appendChild(pier2);

      // Vòng tròn biểu tượng cảng
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      badge.setAttribute('cx', portX);
      badge.setAttribute('cy', portY);
      badge.setAttribute('r', '18');
      badge.setAttribute('fill', theme.fill);
      badge.setAttribute('stroke', '#ffffff');
      badge.setAttribute('stroke-width', '2');
      badge.setAttribute('filter', 'url(#shadowToken)');
      badge.setAttribute('pointer-events', 'all');
      portItem.appendChild(badge);

      // Chữ hiển thị tỉ lệ cảng (3:1 hoặc 2:1)
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', portX);
      text.setAttribute('y', portY - 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '800');
      text.setAttribute('fill', theme.text);
      text.setAttribute('pointer-events', 'none');
      text.textContent = theme.label;
      portItem.appendChild(text);

      // Icon tài nguyên nhỏ phía dưới tỉ lệ
      const subIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      subIcon.setAttribute('x', portX);
      subIcon.setAttribute('y', portY + 9);
      subIcon.setAttribute('text-anchor', 'middle');
      subIcon.setAttribute('font-size', '9');
      subIcon.setAttribute('pointer-events', 'none');
      subIcon.textContent = theme.icon;
      portItem.appendChild(subIcon);

      portItem.addEventListener('click', () => {
        if (this.options.onPortClick) {
          this.options.onPortClick(port);
        }
      });

      portsGroup.appendChild(portItem);
      this.portElements.set(port.id, portItem);
    });

    this.svg.appendChild(portsGroup);
  }

  /**
   * Vẽ 19 Ô địa hình Lục giác
   */
  renderHexes() {
    const hexGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hexGroup.setAttribute('class', 'board-hexes');

    Object.values(this.board.hexes).forEach(hex => {
      const center = toSvgCoords(hex.center.x, hex.center.y);
      const theme = TERRAIN_THEMES[hex.terrain] || TERRAIN_THEMES.desert;
      const points = getHexPolygonPoints(center.x, center.y, BOARD_CONFIG.HEX_RADIUS);

      const hexElem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      hexElem.setAttribute('class', `hex-tile hex-${hex.terrain}`);
      hexElem.setAttribute('data-hex-id', hex.id);

      // 1. Thẻ <polygon> màu nền tiêu chuẩn (Fallback Base)
      const basePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      basePolygon.setAttribute('points', points);
      basePolygon.setAttribute('fill', theme.fill);
      basePolygon.setAttribute('stroke', '#2c3e50');
      basePolygon.setAttribute('stroke-width', '4');
      basePolygon.setAttribute('filter', 'url(#shadowHex)');
      hexElem.appendChild(basePolygon);

      // 2. Thẻ <polygon> phủ Texture / Ảnh địa hình từ assets
      const texturePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      texturePolygon.setAttribute('points', points);
      texturePolygon.setAttribute('fill', `url(#pattern-terrain-${hex.terrain})`);
      texturePolygon.setAttribute('stroke', '#2c3e50');
      texturePolygon.setAttribute('stroke-width', '4');
      texturePolygon.style.cursor = 'pointer';

      texturePolygon.addEventListener('click', () => {
        if (this.options.onHexClick) this.options.onHexClick(hex.id);
      });

      hexElem.appendChild(texturePolygon);

      // Icon địa hình trang trí
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      icon.setAttribute('x', center.x);
      icon.setAttribute('y', center.y - 22);
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', '16');
      icon.setAttribute('opacity', '0.7');
      icon.setAttribute('pointer-events', 'none');
      icon.textContent = theme.icon;
      hexElem.appendChild(icon);

      hexGroup.appendChild(hexElem);
      this.hexElements.set(hex.id, hexElem);
    });

    this.svg.appendChild(hexGroup);
  }

  /**
   * Vẽ 18 Thẻ số (Number Tokens) với pips xác suất
   */
  renderNumberTokens() {
    const tokensGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tokensGroup.setAttribute('class', 'board-number-tokens');

    Object.values(this.board.hexes).forEach(hex => {
      if (hex.diceNumber === null) return; // Sa mạc không có số

      const center = toSvgCoords(hex.center.x, hex.center.y);
      const isRed = (hex.diceNumber === 6 || hex.diceNumber === 8);
      const pipCount = NUMBER_PIPS[hex.diceNumber] || 1;

      const tokenGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      tokenGroup.setAttribute('class', 'number-token');
      tokenGroup.setAttribute('data-dice-number', String(hex.diceNumber));
      tokenGroup.setAttribute('data-hex-id', hex.id);
      tokenGroup.setAttribute('pointer-events', 'none');

      // Vòng tròn parchment
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', center.x);
      circle.setAttribute('cy', center.y);
      circle.setAttribute('r', '19');
      circle.setAttribute('fill', '#fdfefe');
      circle.setAttribute('stroke', '#bdc3c7');
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('filter', 'url(#shadowToken)');
      tokenGroup.appendChild(circle);

      // Chữ số
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', center.x);
      text.setAttribute('y', center.y + 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-family', 'Cinzel, serif');
      text.setAttribute('font-size', isRed ? '19' : '17');
      text.setAttribute('font-weight', '800');
      text.setAttribute('fill', isRed ? '#e74c3c' : '#2c3e50');
      text.textContent = hex.diceNumber;
      tokenGroup.appendChild(text);

      // Các dấu chấm xác suất (Probability Dots)
      const pipsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const pipSpacing = 4.5;
      const startX = center.x - ((pipCount - 1) * pipSpacing) / 2;
      const pipY = center.y + 12;

      for (let p = 0; p < pipCount; p++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', startX + p * pipSpacing);
        dot.setAttribute('cy', pipY);
        dot.setAttribute('r', '1.6');
        dot.setAttribute('fill', isRed ? '#e74c3c' : '#2c3e50');
        pipsGroup.appendChild(dot);
      }
      tokenGroup.appendChild(pipsGroup);

      tokensGroup.appendChild(tokenGroup);
    });

    this.svg.appendChild(tokensGroup);
  }

  /**
   * Vẽ Tên cướp (Robber)
   */
  renderRobber() {
    const robberGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    robberGroup.setAttribute('id', 'robberPiece');
    robberGroup.setAttribute('class', 'robber-piece');

    // Tìm hex đang chứa Robber
    const robberHex = Object.values(this.board.hexes).find(h => h.hasRobber);
    const center = robberHex ? toSvgCoords(robberHex.center.x, robberHex.center.y) : { x: 425, y: 375 };

    robberGroup.innerHTML = `
      <circle cx="${center.x}" cy="${center.y + 14}" r="11" fill="rgba(0,0,0,0.4)" filter="url(#shadowToken)"/>
      <path d="
        M ${center.x - 7} ${center.y + 14}
        L ${center.x - 5} ${center.y - 2}
        C ${center.x - 9} ${center.y - 7}, ${center.x - 5} ${center.y - 14}, ${center.x} ${center.y - 14}
        C ${center.x + 5} ${center.y - 14}, ${center.x + 9} ${center.y - 7}, ${center.x + 5} ${center.y - 2}
        L ${center.x + 7} ${center.y + 14}
        Z
      " fill="#2c3e50" stroke="#17202a" stroke-width="2"/>
      <circle cx="${center.x}" cy="${center.y - 9}" r="5" fill="#34495e"/>
    `;
    robberGroup.style.pointerEvents = 'none';
    this.svg.appendChild(robberGroup);
    this.robberElement = robberGroup;
  }

  /**
   * Cập nhật vị trí Tên cướp sang Hex mới
   */
  updateRobberPosition(targetHexId) {
    const targetHex = this.board.hexes[targetHexId];
    if (!targetHex) return;

    // Cập nhật dữ liệu
    Object.values(this.board.hexes).forEach(h => { h.hasRobber = false; });
    targetHex.hasRobber = true;
    this.board.robberHexId = targetHexId;

    // Cập nhật vị trí SVG
    const center = toSvgCoords(targetHex.center.x, targetHex.center.y);
    if (this.robberElement) {
      this.robberElement.remove();
    }
    this.renderRobber();
  }

  /**
   * Vẽ 72 Cạnh (Edges) tương tác
   */
  renderEdges() {
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'board-edges');

    Object.values(this.board.edges).forEach(edge => {
      const v1 = this.board.vertices[edge.vertexIds[0]];
      const v2 = this.board.vertices[edge.vertexIds[1]];
      const p1 = toSvgCoords(v1.x, v1.y);
      const p2 = toSvgCoords(v2.x, v2.y);

      const edgeItem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      edgeItem.setAttribute('class', 'edge-slot');
      edgeItem.setAttribute('data-edge-id', edge.id);

      // 1. Đường hiển thị thực tế (Visible Road)
      const roadLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      roadLine.setAttribute('x1', p1.x);
      roadLine.setAttribute('y1', p1.y);
      roadLine.setAttribute('x2', p2.x);
      roadLine.setAttribute('y2', p2.y);
      roadLine.setAttribute('stroke-linecap', 'round');

      if (edge.road) {
        roadLine.setAttribute('stroke', edge.road.color || '#e74c3c');
        roadLine.setAttribute('stroke-width', '8');
        roadLine.setAttribute('filter', 'url(#shadowToken)');
      } else {
        roadLine.setAttribute('stroke', 'transparent');
        roadLine.setAttribute('stroke-width', '6');
      }
      edgeItem.appendChild(roadLine);

      // 2. Vùng bắt sự kiện chuột rộng (Hit area 22px)
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitArea.setAttribute('x1', p1.x);
      hitArea.setAttribute('y1', p1.y);
      hitArea.setAttribute('x2', p2.x);
      hitArea.setAttribute('y2', p2.y);
      hitArea.setAttribute('stroke', 'transparent');
      hitArea.setAttribute('stroke-width', '24');
      hitArea.setAttribute('stroke-linecap', 'round');
      hitArea.style.cursor = 'pointer';

      // Hover effect: Kiểm tra động đường trên cạnh từ board state hiện tại
      hitArea.addEventListener('mouseenter', () => {
        const currentRoad = this.board?.edges?.[edge.id]?.road;
        if (!currentRoad) {
          roadLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.55)');
          roadLine.setAttribute('stroke-width', '6');
          roadLine.setAttribute('stroke-dasharray', '4 4');
        }
      });
      hitArea.addEventListener('mouseleave', () => {
        const currentRoad = this.board?.edges?.[edge.id]?.road;
        if (!currentRoad) {
          roadLine.setAttribute('stroke', 'transparent');
          roadLine.removeAttribute('stroke-dasharray');
        } else {
          roadLine.setAttribute('stroke', currentRoad.color || '#e74c3c');
          roadLine.setAttribute('stroke-width', '8');
          roadLine.setAttribute('filter', 'url(#shadowToken)');
          roadLine.removeAttribute('stroke-dasharray');
        }
      });

      hitArea.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.options.onEdgeClick) this.options.onEdgeClick(edge.id);
      });

      edgeItem.appendChild(hitArea);
      edgesGroup.appendChild(edgeItem);
      this.edgeElements.set(edge.id, { item: edgeItem, roadLine });
    });

    this.svg.appendChild(edgesGroup);
  }

  /**
   * Cập nhật đường trên cạnh (Road)
   */
  updateRoad(edgeId, playerColor, playerId = null) {
    const edge = this.board.edges[edgeId];
    const elemObj = this.edgeElements.get(edgeId);
    if (!edge || !elemObj) return;

    if (playerColor) {
      edge.road = { color: playerColor, playerId: playerId || edge.road?.playerId || null };
      elemObj.roadLine.setAttribute('stroke', playerColor);
      elemObj.roadLine.setAttribute('stroke-width', '8');
      elemObj.roadLine.setAttribute('filter', 'url(#shadowToken)');
      elemObj.roadLine.removeAttribute('stroke-dasharray');
    } else {
      edge.road = null;
      elemObj.roadLine.setAttribute('stroke', 'transparent');
      elemObj.roadLine.removeAttribute('filter');
      elemObj.roadLine.removeAttribute('stroke-dasharray');
    }
  }

  /**
   * Đồng bộ toàn diện dữ liệu bàn cờ (Board Data) từ Game State
   */
  syncBoard(boardData) {
    if (!boardData) return;
    this.board = boardData;

    // 1. Cập nhật vị trí Tên cướp
    if (boardData.robberHexId) {
      this.updateRobberPosition(boardData.robberHexId);
    }

    // 2. Cập nhật các công trình trên đỉnh (Settlement / City)
    if (boardData.vertices) {
      Object.values(boardData.vertices).forEach(v => {
        if (v.building) {
          this.updateBuilding(v.id, v.building);
        }
      });
    }

    // 3. Cập nhật tất cả các con đường trên cạnh (Road)
    if (boardData.edges) {
      Object.values(boardData.edges).forEach(e => {
        if (e.road) {
          this.updateRoad(e.id, e.road.color, e.road.playerId);
        }
      });
    }
  }

  /**
   * Vẽ 54 Đỉnh (Vertices) tương tác
   */
  renderVertices() {
    const verticesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    verticesGroup.setAttribute('class', 'board-vertices');

    Object.values(this.board.vertices).forEach(vertex => {
      const p = toSvgCoords(vertex.x, vertex.y);

      const vertexItem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      vertexItem.setAttribute('class', 'vertex-slot');
      vertexItem.setAttribute('data-vertex-id', vertex.id);

      // Điểm hiển thị công trình (Building Node)
      const buildingNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.renderBuildingContent(buildingNode, vertex.building, p);
      vertexItem.appendChild(buildingNode);

      // Vùng tương tác chuột (Hit area bán kính 16px)
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hitArea.setAttribute('cx', p.x);
      hitArea.setAttribute('cy', p.y);
      hitArea.setAttribute('r', '16');
      hitArea.setAttribute('fill', 'transparent');
      hitArea.style.cursor = 'pointer';

      // Hover effect khi chưa có công trình
      hitArea.addEventListener('mouseenter', () => {
        if (!vertex.building) {
          const hoverDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hoverDot.setAttribute('class', 'hover-preview-dot');
          hoverDot.setAttribute('cx', p.x);
          hoverDot.setAttribute('cy', p.y);
          hoverDot.setAttribute('r', '6');
          hoverDot.setAttribute('fill', 'rgba(255, 255, 255, 0.7)');
          hoverDot.setAttribute('stroke', '#2c3e50');
          hoverDot.setAttribute('stroke-width', '2');
          hoverDot.setAttribute('pointer-events', 'none');
          vertexItem.appendChild(hoverDot);
        }
      });
      hitArea.addEventListener('mouseleave', () => {
        const dot = vertexItem.querySelector('.hover-preview-dot');
        if (dot) dot.remove();
      });

      hitArea.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.options.onVertexClick) this.options.onVertexClick(vertex.id);
      });

      vertexItem.appendChild(hitArea);
      verticesGroup.appendChild(vertexItem);
      this.vertexElements.set(vertex.id, { item: vertexItem, buildingNode, point: p });
    });

    this.svg.appendChild(verticesGroup);
  }

  /**
   * Vẽ hình dạng Settlement hoặc City
   */
  renderBuildingContent(container, building, point) {
    container.innerHTML = '';
    if (!building) return;

    const color = building.color || '#e74c3c';

    if (building.type === 'settlement') {
      // Hình ngôi nhà (Settlement)
      const house = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      house.setAttribute('d', `
        M ${point.x - 7} ${point.y + 6}
        L ${point.x + 7} ${point.y + 6}
        L ${point.x + 7} ${point.y - 2}
        L ${point.x}     ${point.y - 8}
        L ${point.x - 7} ${point.y - 2}
        Z
      `);
      house.setAttribute('fill', color);
      house.setAttribute('stroke', '#ffffff');
      house.setAttribute('stroke-width', '1.5');
      house.setAttribute('filter', 'url(#shadowToken)');
      container.appendChild(house);
    } else if (building.type === 'city') {
      // Hình tòa thành / pháo đài (City)
      const castle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      castle.setAttribute('d', `
        M ${point.x - 10} ${point.y + 7}
        L ${point.x + 10} ${point.y + 7}
        L ${point.x + 10} ${point.y - 3}
        L ${point.x + 3}  ${point.y - 3}
        L ${point.x + 3}  ${point.y - 6}
        L ${point.x - 3}  ${point.y - 11}
        L ${point.x - 10} ${point.y - 6}
        Z
      `);
      castle.setAttribute('fill', color);
      castle.setAttribute('stroke', '#ffffff');
      castle.setAttribute('stroke-width', '1.5');
      castle.setAttribute('filter', 'url(#shadowToken)');
      container.appendChild(castle);
    }
  }

  /**
   * Cập nhật công trình tại một đỉnh (Building)
   */
  updateBuilding(vertexId, buildingData) {
    const vertex = this.board.vertices[vertexId];
    const elemObj = this.vertexElements.get(vertexId);
    if (!vertex || !elemObj) return;

    vertex.building = buildingData; // { type: 'settlement' | 'city', color: string }
    this.renderBuildingContent(elemObj.buildingNode, buildingData, elemObj.point);
  }

  /**
   * Cài đặt tương tác Thu phóng (Wheel Zoom) và Kéo bàn (Pan)
   */
  setupPanAndZoom() {
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.88 : 1.14;
      this.zoomAtPoint(e.clientX, e.clientY, zoomFactor);
    }, { passive: false });

    this.svg.addEventListener('mousedown', (e) => {
      // Chỉ kéo bàn khi không click vào đỉnh, cạnh hay vùng tương tác
      const isVertex = e.target.closest && e.target.closest('.vertex-slot');
      const isEdge = e.target.closest && e.target.closest('.edge-slot');
      if (!isVertex && !isEdge) {
        this.isPanning = true;
        this.startPan = { x: e.clientX, y: e.clientY };
        this.startViewBox = { ...this.viewBox };
        this.svg.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const rect = this.svg.getBoundingClientRect();
      const scaleX = this.viewBox.width / rect.width;
      const scaleY = this.viewBox.height / rect.height;

      const dx = (e.clientX - this.startPan.x) * scaleX;
      const dy = (e.clientY - this.startPan.y) * scaleY;

      this.viewBox.x = this.startViewBox.x - dx;
      this.viewBox.y = this.startViewBox.y - dy;
      this.applyViewBox();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.svg.style.cursor = '';
      }
    });
  }

  zoomAtPoint(clientX, clientY, factor) {
    const rect = this.svg.getBoundingClientRect();
    const mouseXRatio = (clientX - rect.left) / rect.width;
    const mouseYRatio = (clientY - rect.top) / rect.height;

    const newWidth = this.viewBox.width * factor;
    const newHeight = this.viewBox.height * factor;

    // Giới hạn zoom từ 0.35x đến 2.6x
    const minWidth = this.initialViewBox.width * 0.35;
    const maxWidth = this.initialViewBox.width * 2.6;

    if (newWidth < minWidth || newWidth > maxWidth) return;

    this.viewBox.x += (this.viewBox.width - newWidth) * mouseXRatio;
    this.viewBox.y += (this.viewBox.height - newHeight) * mouseYRatio;
    this.viewBox.width = newWidth;
    this.viewBox.height = newHeight;

    this.applyViewBox();
  }

  zoomIn() {
    const rect = this.svg.getBoundingClientRect();
    this.zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.85);
  }

  zoomOut() {
    const rect = this.svg.getBoundingClientRect();
    this.zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.18);
  }

  resetZoom() {
    this.viewBox = { ...this.initialViewBox };
    this.applyViewBox();
  }

  applyViewBox() {
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
  }

  /**
   * Lấy tọa độ màn hình thực tế (Viewport Client Pixels) của tâm ô lục giác
   */
  getHexScreenCenter(hexId) {
    const hex = this.board.hexes[hexId];
    if (!hex) return null;

    const svgCoords = toSvgCoords(hex.center.x, hex.center.y);
    const pt = this.svg.createSVGPoint();
    pt.x = svgCoords.x;
    pt.y = svgCoords.y;

    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const screenPt = pt.matrixTransform(ctm);
    return { x: screenPt.x, y: screenPt.y };
  }

  /**
   * Bật nhẹ thẻ số trên bàn cờ khi xúc xắc trúng số đó
   */
  bounceNumberTokens(diceNumber) {
    if (!diceNumber) return;
    const tokens = this.svg.querySelectorAll(`.number-token[data-dice-number="${diceNumber}"]`);
    tokens.forEach(tok => {
      const hexId = tok.getAttribute('data-hex-id');
      const hex = this.board.hexes[hexId];
      // Chỉ bounce các ô không bị tên cướp chặn
      if (hex && !hex.hasRobber) {
        tok.classList.remove('token-bounce-active');
        void tok.offsetWidth;
        tok.classList.add('token-bounce-active');
        setTimeout(() => tok.classList.remove('token-bounce-active'), 650);
      }
    });
  }

  /**
   * Rung lắc Tên cướp khi xúc xắc ra số 7
   */
  shakeRobber() {
    if (!this.robberElement) return;
    this.robberElement.classList.remove('robber-shake-active');
    void this.robberElement.offsetWidth;
    this.robberElement.classList.add('robber-shake-active');
    setTimeout(() => this.robberElement?.classList.remove('robber-shake-active'), 850);
  }

  /**
   * Hiển thị chấm / đường xanh lá hoặc đỏ trong suốt ở điểm ĐƯỢC và KHÔNG ĐƯỢC đặt
   */
  highlightDropTargets(type, options = {}) {
    this.clearDropTargetHighlights();
    const playerId = options.playerId;
    const isSetupPhase = options.isSetupPhase || false;

    if (type === 'settlement') {
      this.vertexElements.forEach((elem, vId) => {
        const v = this.board.vertices[vId];
        if (!v) return;

        let isValid = true;

        // 1. Phải chưa có công trình nào (không vẽ đè preview lên công trình đã có)
        if (v.building !== null) {
          return;
        }

        // 2. Quy tắc khoảng cách (Distance Rule)
        for (const neighborId of v.adjacentVertexIds) {
          if (this.board.vertices[neighborId]?.building !== null) {
            isValid = false;
            break;
          }
        }

        // 3. Quy tắc kết nối đường (chỉ áp dụng ở lượt thường, không áp dụng ở Setup)
        if (isValid && !isSetupPhase) {
          const hasMyRoad = v.adjacentEdgeIds.some(eId => {
            const edge = this.board.edges[eId];
            return edge && edge.road && edge.road.playerId === playerId;
          });
          if (!hasMyRoad) {
            isValid = false;
          }
        }

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', elem.point.x);
        dot.setAttribute('cy', elem.point.y);
        dot.setAttribute('pointer-events', 'none');

        if (isValid) {
          dot.setAttribute('class', 'drop-preview-dot valid');
          dot.setAttribute('r', '9');
          dot.setAttribute('fill', 'rgba(46, 204, 113, 0.78)');
          dot.setAttribute('stroke', '#27ae60');
          dot.setAttribute('stroke-width', '2');
        } else {
          dot.setAttribute('class', 'drop-preview-dot invalid');
          dot.setAttribute('r', '6');
          dot.setAttribute('fill', 'rgba(231, 76, 60, 0.5)');
          dot.setAttribute('stroke', '#c0392b');
          dot.setAttribute('stroke-width', '1.5');
        }

        elem.item.appendChild(dot);
      });
    } else if (type === 'city') {
      this.vertexElements.forEach((elem, vId) => {
        const v = this.board.vertices[vId];
        if (!v) return;

        const isValid = Boolean(
          v.building &&
          v.building.type === 'settlement' &&
          (!playerId || v.building.playerId === playerId)
        );

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', elem.point.x);
        dot.setAttribute('cy', elem.point.y);
        dot.setAttribute('pointer-events', 'none');

        if (isValid) {
          dot.setAttribute('class', 'drop-preview-dot valid');
          dot.setAttribute('r', '11');
          dot.setAttribute('fill', 'rgba(46, 204, 113, 0.8)');
          dot.setAttribute('stroke', '#27ae60');
          dot.setAttribute('stroke-width', '2.5');
        } else {
          dot.setAttribute('class', 'drop-preview-dot invalid');
          dot.setAttribute('r', '6');
          dot.setAttribute('fill', 'rgba(231, 76, 60, 0.45)');
          dot.setAttribute('stroke', '#c0392b');
          dot.setAttribute('stroke-width', '1.5');
        }

        elem.item.appendChild(dot);
      });
    } else if (type === 'road') {
      this.edgeElements.forEach((elem, eId) => {
        const edge = this.board.edges[eId];
        if (!edge) return;

        const v1 = this.board.vertices[edge.vertexIds[0]];
        const v2 = this.board.vertices[edge.vertexIds[1]];
        if (!v1 || !v2) return;

        const p1 = toSvgCoords(v1.x, v1.y);
        const p2 = toSvgCoords(v2.x, v2.y);

        let isValid = true;

        // Đã có đường xây rồi -> Không bao giờ vẽ đè preview lên đường đã có
        if (edge.road !== null) {
          return;
        }

        if (isSetupPhase) {
          if (options.setupSettlementVertexId) {
            isValid = edge.vertexIds.includes(options.setupSettlementVertexId);
          } else {
            isValid = edge.vertexIds.some(vId => this.board.vertices[vId]?.building?.playerId === playerId);
          }
        } else {
          let isConnected = false;
          for (const vId of edge.vertexIds) {
            const v = this.board.vertices[vId];
            if (!v) continue;
            if (v.building && v.building.playerId === playerId) {
              isConnected = true;
              break;
            }
            if (v.building && v.building.playerId !== playerId) {
              continue; // Bị công trình đối thủ chặn
            }
            const hasAdjRoad = v.adjacentEdgeIds.some(adjEId => {
              if (adjEId === eId) return false;
              return this.board.edges[adjEId]?.road?.playerId === playerId;
            });
            if (hasAdjRoad) {
              isConnected = true;
              break;
            }
          }
          isValid = isConnected;
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1.x);
        line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x);
        line.setAttribute('y2', p2.y);
        line.setAttribute('pointer-events', 'none');

        if (isValid) {
          line.setAttribute('class', 'drop-preview-line valid');
          line.setAttribute('stroke', 'rgba(46, 204, 113, 0.82)');
          line.setAttribute('stroke-width', '8.5');
          line.setAttribute('stroke-linecap', 'round');
        } else {
          line.setAttribute('class', 'drop-preview-line invalid');
          line.setAttribute('stroke', 'rgba(231, 76, 60, 0.45)');
          line.setAttribute('stroke-width', '4.5');
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('stroke-dasharray', '4 4');
        }

        elem.item.appendChild(line);
      });
    }
  }

  clearDropTargetHighlights() {
    this.svg.querySelectorAll('.drop-preview-dot, .drop-preview-line, .drop-target-active').forEach(el => {
      if (el.classList.contains('drop-preview-dot') || el.classList.contains('drop-preview-line')) {
        el.remove();
      } else {
        el.classList.remove('drop-target-active');
      }
    });
  }
}
