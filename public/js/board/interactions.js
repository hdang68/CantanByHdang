/**
 * BOARD INTERACTIONS & SANDBOX INSPECTOR
 * Quản lý tương tác click, hover, tooltip và chế độ thử nghiệm bàn cờ.
 */

const TEST_COLORS = ['#e74c3c', '#3498db', '#e67e22', '#ecf0f1'];

export class BoardInteractions {
  constructor(renderer, logCallback) {
    this.renderer = renderer;
    this.board = renderer.board;
    this.log = logCallback || console.log;
    this.currentColorIndex = 0;

    this.setupInteractions();
  }

  setupInteractions() {
    // 1. Tương tác khi click đỉnh (Vertex)
    this.renderer.options.onVertexClick = (vertexId) => {
      const vertex = this.board.vertices[vertexId];
      if (!vertex) return;

      const playerColor = TEST_COLORS[this.currentColorIndex];

      if (!vertex.building) {
        // Đặt Settlement thử nghiệm
        this.renderer.updateBuilding(vertexId, { type: 'settlement', color: playerColor });
        this.log(`[Đỉnh ${vertexId}] Đã xây Khu định cư thử nghiệm (${playerColor})`, 'event');
      } else if (vertex.building.type === 'settlement') {
        // Nâng cấp lên City
        this.renderer.updateBuilding(vertexId, { type: 'city', color: playerColor });
        this.log(`[Đỉnh ${vertexId}] Đã nâng cấp lên Thành phố thử nghiệm (${playerColor})`, 'event');
      } else {
        // Xóa công trình
        this.renderer.updateBuilding(vertexId, null);
        this.log(`[Đỉnh ${vertexId}] Đã dọn sạch công trình`, 'system');
      }

      this.updateInspector('vertex', vertex);
    };

    // 2. Tương tác khi click cạnh (Edge)
    this.renderer.options.onEdgeClick = (edgeId) => {
      const edge = this.board.edges[edgeId];
      if (!edge) return;

      const playerColor = TEST_COLORS[this.currentColorIndex];

      if (!edge.road) {
        // Đặt Đường thử nghiệm
        this.renderer.updateRoad(edgeId, playerColor);
        this.log(`[Cạnh ${edgeId}] Đã xây Đường thử nghiệm (${playerColor})`, 'event');
      } else {
        // Xóa đường
        this.renderer.updateRoad(edgeId, null);
        this.log(`[Cạnh ${edgeId}] Đã gỡ bỏ đường`, 'system');
      }

      this.updateInspector('edge', edge);
    };

    // 3. Tương tác khi click ô lục giác (Hex) -> Di chuyển Tên cướp
    this.renderer.options.onHexClick = (hexId) => {
      const hex = this.board.hexes[hexId];
      if (!hex) return;

      if (hex.hasRobber) {
        this.log(`[Ô ${hexId}] Tên cướp đã đang ở đây!`, 'system');
        return;
      }

      this.renderer.updateRobberPosition(hexId);
      this.log(`[Ô ${hexId} - ${hex.terrain.toUpperCase()}] Tên cướp đã di chuyển tới đây!`, 'event');
      this.updateInspector('hex', hex);
    };
  }

  /**
   * Đổi màu người chơi thử nghiệm hiện tại
   */
  cycleTestColor() {
    this.currentColorIndex = (this.currentColorIndex + 1) % TEST_COLORS.length;
    return TEST_COLORS[this.currentColorIndex];
  }

  /**
   * Xóa toàn bộ công trình và đường thử nghiệm trên bàn cờ
   */
  clearAllPieces() {
    Object.keys(this.board.vertices).forEach(vId => {
      this.renderer.updateBuilding(vId, null);
    });
    Object.keys(this.board.edges).forEach(eId => {
      this.renderer.updateRoad(eId, null);
    });
    this.log('Đã dọn sạch tất cả công trình và đường trên bàn cờ.', 'system');
  }

  /**
   * Cập nhật thông tin chi tiết của phần tử vào thanh thông tin (Inspector Panel)
   */
  updateInspector(type, data) {
    const infoBox = document.getElementById('boardInfoDetails');
    if (!infoBox) return;

    if (type === 'vertex') {
      const portText = data.port ? `Cảng ${data.port.type.toUpperCase()} (${data.port.ratio}:1)` : 'Không';
      infoBox.innerHTML = `
        <strong>Đỉnh: ${data.id}</strong> | 
        Tọa độ: (${data.x}, ${data.y}) | 
        Cảng: <span class="highlight">${portText}</span> | 
        Ô kề: [${data.adjacentHexIds.join(', ')}] | 
        Công trình: ${data.building ? `${data.building.type} (${data.building.color})` : 'Trống'}
      `;
    } else if (type === 'edge') {
      infoBox.innerHTML = `
        <strong>Cạnh: ${data.id}</strong> | 
        Nối đỉnh: [${data.vertexIds.join(' ↔ ')}] | 
        Ô kề: [${data.adjacentHexIds.join(', ')}] | 
        Đường: ${data.road ? `Có (${data.road.color})` : 'Trống'}
      `;
    } else if (type === 'hex') {
      infoBox.innerHTML = `
        <strong>Ô: ${data.id}</strong> | 
        Địa hình: <span class="highlight">${data.terrain.toUpperCase()}</span> | 
        Số: ${data.diceNumber || 'Sa mạc'} | 
        Tên cướp: ${data.hasRobber ? '🔴 Đang ở đây' : 'Không'}
      `;
    }
  }
}
