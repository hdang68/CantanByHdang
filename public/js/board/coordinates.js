/**
 * BOARD COORDINATES & GEOMETRY HELPERS FOR SVG
 */

export const BOARD_CONFIG = {
  HEX_RADIUS: 65,      // Bán kính mỗi ô lục giác (pixel)
  BOARD_WIDTH: 850,    // Kích thước viewBox SVG
  BOARD_HEIGHT: 750,
  CENTER_X: 425,       // Tâm của bàn cờ trong hệ tọa độ SVG
  CENTER_Y: 375
};

export const BOARD_CONFIG_6P = {
  HEX_RADIUS: 56,      // Bán kính mỗi ô lục giác cho bản đồ 30 ô
  BOARD_WIDTH: 940,    // Kích thước viewBox SVG mở rộng
  BOARD_HEIGHT: 860,
  CENTER_X: 470,       // Tâm của bàn cờ 30 ô
  CENTER_Y: 430
};

export function getActiveBoardConfig(is56 = false) {
  return is56 ? BOARD_CONFIG_6P : BOARD_CONFIG;
};

export const TERRAIN_THEMES = {
  forest: {
    name: 'Rừng (Gỗ)',
    fill: '#24593e',
    stroke: '#1b432e',
    text: '#ffffff',
    icon: '🌲'
  },
  hills: {
    name: 'Đồi (Đất sét)',
    fill: '#a04000',
    stroke: '#783000',
    text: '#ffffff',
    icon: '🧱'
  },
  pasture: {
    name: 'Đồng cỏ (Cừu)',
    fill: '#4f9d69',
    stroke: '#3b7850',
    text: '#ffffff',
    icon: '🐑'
  },
  fields: {
    name: 'Đồng bằng (Lúa mì)',
    fill: '#d4ac0d',
    stroke: '#b7950b',
    text: '#1a1a1a',
    icon: '🌾'
  },
  mountains: {
    name: 'Núi (Quặng)',
    fill: '#5d6d7e',
    stroke: '#34495e',
    text: '#ffffff',
    icon: '⛰️'
  },
  desert: {
    name: 'Sa mạc',
    fill: '#d5b97b',
    stroke: '#bfa05d',
    text: '#3e2723',
    icon: '🏜️'
  }
};

export const PORT_THEMES = {
  generic: { label: '3:1', icon: '⚓', fill: '#f5b041', text: '#1a1a1a' },
  wood:    { label: '2:1', icon: '🌲', fill: '#24593e', text: '#ffffff' },
  clay:    { label: '2:1', icon: '🧱', fill: '#a04000', text: '#ffffff' },
  sheep:   { label: '2:1', icon: '🐑', fill: '#4f9d69', text: '#ffffff' },
  wheat:   { label: '2:1', icon: '🌾', fill: '#d4ac0d', text: '#1a1a1a' },
  ore:     { label: '2:1', icon: '⛰️', fill: '#5d6d7e', text: '#ffffff' }
};

let currentActiveConfig = BOARD_CONFIG;

export function setActiveBoardConfig(config) {
  if (config) currentActiveConfig = config;
}

export function getActiveConfig() {
  return currentActiveConfig;
}

/**
 * Chuyển tọa độ tương đối từ trung tâm sang tọa độ tuyệt đối SVG
 */
export function toSvgCoords(x, y, config = currentActiveConfig) {
  const activeCfg = config || currentActiveConfig;
  return {
    x: activeCfg.CENTER_X + x * (activeCfg.HEX_RADIUS / 100),
    y: activeCfg.CENTER_Y + y * (activeCfg.HEX_RADIUS / 100)
  };
}

/**
 * Tạo chuỗi 'points' cho thẻ <polygon> lục giác
 */
export function getHexPolygonPoints(centerX, centerY, R) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = (Math.PI / 180) * (30 + i * 60);
    const vx = centerX + R * Math.cos(angleRad);
    const vy = centerY + R * Math.sin(angleRad);
    points.push(`${vx.toFixed(1)},${vy.toFixed(1)}`);
  }
  return points.join(' ');
}
