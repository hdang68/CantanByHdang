/**
 * Flying Resource & Development Card Animation Engine
 * Quỹ đạo điện ảnh 3 giai đoạn:
 * 1. Gốc (Hex / Người chơi / Ngân hàng / Túi thẻ)
 * 2. Phóng to cực đại (Zoom large 2.8x - 3.0x) ra giữa bàn cờ với biểu tượng, tên gọi và hào quang rực rỡ
 * 3. Thu nhỏ dần (0.55x) về phía đích đến và kích hoạt hiệu ứng nổ hạt (Impact Ripple) & xung nhận (Pulse)
 */

export const ITEM_CONFIG = {
  // 5 Tài nguyên cơ bản của Catan
  wood: { icon: '🌲', name: 'Gỗ', color: '#2d6a4f', glow: 'rgba(45, 106, 79, 0.95)' },
  clay: { icon: '🧱', name: 'Đất sét', color: '#b7410e', glow: 'rgba(183, 65, 14, 0.95)' },
  sheep: { icon: '🐑', name: 'Cừu', color: '#52b788', glow: 'rgba(82, 183, 136, 0.95)' },
  wheat: { icon: '🌾', name: 'Lúa mì', color: '#f39c12', glow: 'rgba(243, 156, 18, 0.95)' },
  ore: { icon: '⛰️', name: 'Quặng', color: '#7f8c8d', glow: 'rgba(127, 140, 141, 0.95)' },

  // Các thẻ phát triển (Development Cards)
  knight: { icon: '⚔️', name: 'Hiệp sĩ', color: '#8e44ad', glow: 'rgba(142, 68, 173, 0.95)', isCard: true },
  victory_point: { icon: '🏆', name: 'Điểm chiến thắng', color: '#f1c40f', glow: 'rgba(241, 196, 15, 0.95)', isCard: true },
  road_building: { icon: '🛣️', name: 'Xây đường', color: '#27ae60', glow: 'rgba(39, 174, 96, 0.95)', isCard: true },
  year_of_plenty: { icon: '📜', name: 'Bội thu', color: '#2980b9', glow: 'rgba(41, 128, 185, 0.95)', isCard: true },
  monopoly: { icon: '💎', name: 'Độc quyền', color: '#d35400', glow: 'rgba(211, 84, 0, 0.95)', isCard: true },
  dev_card: { icon: '🃏', name: 'Thẻ phát triển', color: '#9b59b6', glow: 'rgba(155, 89, 182, 0.95)', isCard: true },

  // Nhãn chung và dự phòng
  resource: { icon: '✨', name: 'Tài nguyên', color: '#f39c12', glow: 'rgba(243, 156, 18, 0.95)' },
  unknown: { icon: '❓', name: 'Thẻ bài', color: '#e67e22', glow: 'rgba(230, 126, 34, 0.95)' }
};

let container = null;

function getContainer() {
  if (!container) {
    container = document.getElementById('flyingParticlesContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'flyingParticlesContainer';
      container.className = 'flying-particles-container';
      document.body.appendChild(container);
    }
  }
  return container;
}

/**
 * Lấy tọa độ tâm bàn cờ hoặc tâm màn hình
 */
export function getTableCenterPos() {
  const boardElem = document.getElementById('svgBoardContainer') || document.querySelector('.board-canvas-wrapper');
  if (boardElem) {
    const rect = boardElem.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    }
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };
}

/**
 * Tạo 1 thẻ / hạt bay theo quỹ đạo: GỐC -> ZOOM LỚN RA GIỮA BÀN -> THU NHỎ DẦN ĐẾN ĐÍCH
 */
export function spawnFlyingItem(itemType, startPos, targetPos, options = {}) {
  const {
    delay = 0,
    label = null,
    centerPos = null,
    duration = 1350, // ms - Tăng thời lượng để có nhịp giữ ở giữa bàn rõ ràng
    onComplete = null
  } = options;

  const root = getContainer();
  const config = ITEM_CONFIG[itemType] || ITEM_CONFIG.unknown;
  const isCard = config.isCard || false;

  const chip = document.createElement('div');
  chip.className = `flying-res-chip res-${itemType} ${isCard ? 'is-card' : ''}`;
  chip.style.setProperty('--chip-glow', config.glow);
  chip.style.backgroundColor = config.color;

  const displayLabel = label || config.name;
  chip.innerHTML = `
    <span class="chip-emoji">${config.icon}</span>
    <span class="chip-label">${displayLabel}</span>
  `;

  const labelElem = chip.querySelector('.chip-label');

  // Thêm độ lệch ngẫu nhiên nhẹ để khi bay nhiều thẻ/hạt cùng lúc không bị đè khít lên nhau
  const jitterX = (Math.random() - 0.5) * 16;
  const jitterY = (Math.random() - 0.5) * 16;

  const sX = (startPos?.x ?? (window.innerWidth / 2)) + jitterX;
  const sY = (startPos?.y ?? (window.innerHeight / 2)) + jitterY;
  const tX = (targetPos?.x ?? (window.innerWidth / 2)) + jitterX;
  const tY = (targetPos?.y ?? (window.innerHeight / 2)) + jitterY;

  // Điểm giữa bàn cờ (Tâm bàn)
  const defaultCenter = getTableCenterPos();
  const cX = (centerPos?.x ?? defaultCenter.x) + (Math.random() - 0.5) * 16;
  const cY = (centerPos?.y ?? defaultCenter.y) + (Math.random() - 0.5) * 16;

  // Điểm uốn cong bán nguyệt (Arc control points)
  const mid1X = (sX + cX) / 2;
  const mid1Y = Math.min(sY, cY) - 35 - Math.random() * 25;

  const mid2X = (cX + tX) / 2;
  const mid2Y = Math.min(cY, tY) - 30 - Math.random() * 25;

  chip.style.left = `${sX}px`;
  chip.style.top = `${sY}px`;
  chip.style.transform = `translate(0px, 0px) scale(0.8)`;
  chip.style.opacity = '1';

  root.appendChild(chip);

  const startTime = performance.now() + delay;

  function animate(currentTime) {
    if (currentTime < startTime) {
      requestAnimationFrame(animate);
      return;
    }

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    let curX, curY, currentScale;

    if (progress < 0.35) {
      // GIAI ĐOẠN 1: Từ Gốc (startPos) -> Bay ra giữa bàn (centerPos) và ZOOM LỚN (0.8 -> 2.85)
      const u = progress / 0.35; // 0 -> 1
      const t = easeOutQuad(u);
      const invT = 1 - t;

      curX = (invT * invT * sX) + (2 * invT * t * mid1X) + (t * t * cX);
      curY = (invT * invT * sY) + (2 * invT * t * mid1Y) + (t * t * cY);

      // Scale tăng vọt từ 0.8 lên 2.85
      currentScale = 0.8 + 2.05 * Math.sin((u * Math.PI) / 2);

      // Nhãn tên hiển thị dần khi phóng to
      if (labelElem) {
        labelElem.style.opacity = u > 0.4 ? String(Math.min((u - 0.4) / 0.4, 1)) : '0';
      }

      if (u > 0.7) {
        chip.classList.add('zoomed-large');
      }
    } else if (progress <= 0.65) {
      // GIAI ĐOẠN 2: GIỮ MỘT NHỊP LÂU HƠN Ở GIỮA BÀN (HOLD AT CENTER ZOOM)
      // Dừng chân tại tâm bàn cờ với hiệu ứng lơ lửng nhẹ và hào quang sáng rực
      const holdRatio = (progress - 0.35) / 0.30; // 0 -> 1
      const hoverFloat = Math.sin(holdRatio * Math.PI) * 4; // Nhấp nhô nhẹ 4px
      curX = cX;
      curY = cY - hoverFloat;

      // Giữ kích thước phóng to 2.85 - 2.95 cực đại trong suốt nhịp dừng
      currentScale = 2.85 + Math.sin(holdRatio * Math.PI) * 0.12;

      chip.classList.add('zoomed-large');
      if (labelElem) {
        labelElem.style.opacity = '1';
      }
    } else {
      // GIAI ĐOẠN 3: Từ giữa bàn (centerPos) -> Bay đến Đích (targetPos) và THU NHỎ DẦN (2.85 -> 0.55)
      const u = (progress - 0.65) / 0.35; // 0 -> 1
      const t = easeInQuad(u);
      const invT = 1 - t;

      curX = (invT * invT * cX) + (2 * invT * t * mid2X) + (t * t * tX);
      curY = (invT * invT * cY) + (2 * invT * t * mid2Y) + (t * t * tY);

      // Scale thu nhỏ dần từ 2.85 xuống 0.55
      currentScale = 2.85 - (2.85 - 0.55) * Math.sin((u * Math.PI) / 2);

      // Nhãn tên mờ dần khi bắt đầu thu nhỏ về đích
      if (labelElem) {
        labelElem.style.opacity = u < 0.4 ? String(1 - (u / 0.4)) : '0';
      }

      if (u > 0.25) {
        chip.classList.remove('zoomed-large');
      }
    }

    const opacity = progress > 0.93 ? 1 - (progress - 0.93) / 0.07 : 1;

    chip.style.transform = `translate(${curX - sX}px, ${curY - sY}px) scale(${currentScale})`;
    chip.style.opacity = String(opacity);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      chip.remove();
      spawnImpactRipple(tX, tY, config.color);
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Tương thích ngược: Alias cho spawnFlyingItem
 */
export function spawnFlyingChip(resourceType, startPos, targetPos, delay = 0, onComplete = null) {
  spawnFlyingItem(resourceType, startPos, targetPos, { delay, onComplete });
}

function easeOutQuad(x) {
  return 1 - (1 - x) * (1 - x);
}

function easeInQuad(x) {
  return x * x;
}

/**
 * Hiệu ứng nổ hạt & sóng tỏa khi chạm đích
 */
export function spawnImpactRipple(x, y, color) {
  const root = getContainer();
  const ripple = document.createElement('div');
  ripple.className = 'impact-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.borderColor = color || '#f1c40f';
  root.appendChild(ripple);

  setTimeout(() => ripple.remove(), 450);
}

/**
 * 1. Thu hoạch xúc xắc / Khởi đầu (Hex -> Giữa bàn Zoom lớn -> Người chơi Thu nhỏ)
 */
export function animateHarvestProduction(productionEvents, getHexCoordsFn, getPlayerElementFn) {
  if (!productionEvents || !productionEvents.length) return;

  let delayCounter = 0;
  productionEvents.forEach(evt => {
    const hexCoords = getHexCoordsFn(evt.hexId);
    const playerEl = getPlayerElementFn(evt.playerId);

    if (!hexCoords || !playerEl) return;

    const playerRect = playerEl.getBoundingClientRect();
    const targetPos = {
      x: playerRect.left + playerRect.width / 2,
      y: playerRect.top + playerRect.height / 2
    };

    for (let i = 0; i < (evt.count || 1); i++) {
      spawnFlyingItem(evt.resource, hexCoords, targetPos, {
        delay: delayCounter * 120,
        onComplete: () => {
          playerEl.classList.remove('pulse-receive');
          void playerEl.offsetWidth;
          playerEl.classList.add('pulse-receive');
        }
      });
      delayCounter++;
    }
  });
}

/**
 * 2. Chi trả chi phí xây dựng (Người chơi -> Giữa bàn Zoom lớn -> Ngân hàng Thu nhỏ)
 */
export function animateSpendResources(cost, getPlayerElementFn, playerId, getBankStackElementFn) {
  if (!cost) return;

  const playerEl = getPlayerElementFn(playerId);
  if (!playerEl) return;

  const playerRect = playerEl.getBoundingClientRect();
  const startPos = {
    x: playerRect.left + playerRect.width / 2,
    y: playerRect.top + playerRect.height / 2
  };

  let delayCounter = 0;
  Object.entries(cost).forEach(([res, amount]) => {
    if (!amount || amount <= 0) return;

    const bankEl = getBankStackElementFn(res);
    let targetPos = { x: window.innerWidth - 80, y: window.innerHeight / 2 };

    if (bankEl) {
      const bRect = bankEl.getBoundingClientRect();
      targetPos = {
        x: bRect.left + bRect.width / 2,
        y: bRect.top + bRect.height / 2
      };
    }

    for (let i = 0; i < amount; i++) {
      spawnFlyingItem(res, startPos, targetPos, {
        delay: delayCounter * 100,
        onComplete: () => {
          if (bankEl) {
            bankEl.classList.remove('pulse-receive');
            void bankEl.offsetWidth;
            bankEl.classList.add('pulse-receive');
          }
        }
      });
      delayCounter++;
    }
  });
}

/**
 * 3. Giao dịch Ngân hàng / Cảng:
 * - Đưa tài nguyên: Người chơi -> Giữa bàn Zoom lớn -> Ngân hàng
 * - Nhận tài nguyên: Ngân hàng -> Giữa bàn Zoom lớn -> Người chơi
 */
export function animateBankTrade(playerId, giveRes, giveCount, getRes, getCount, getPlayerElementFn, getBankStackElementFn) {
  const playerEl = getPlayerElementFn(playerId);
  if (!playerEl) return;

  const pRect = playerEl.getBoundingClientRect();
  const playerPos = { x: pRect.left + pRect.width / 2, y: pRect.top + pRect.height / 2 };

  const giveBankEl = getBankStackElementFn(giveRes);
  const getBankEl = getBankStackElementFn(getRes);

  const giveBankPos = giveBankEl
    ? { x: giveBankEl.getBoundingClientRect().left + giveBankEl.getBoundingClientRect().width / 2, y: giveBankEl.getBoundingClientRect().top + giveBankEl.getBoundingClientRect().height / 2 }
    : { x: window.innerWidth - 80, y: window.innerHeight / 2 };

  const getBankPos = getBankEl
    ? { x: getBankEl.getBoundingClientRect().left + getBankEl.getBoundingClientRect().width / 2, y: getBankEl.getBoundingClientRect().top + getBankEl.getBoundingClientRect().height / 2 }
    : { x: window.innerWidth - 80, y: window.innerHeight / 2 };

  let delay = 0;

  // Chi ra cho Ngân hàng
  for (let i = 0; i < (giveCount || 1); i++) {
    spawnFlyingItem(giveRes, playerPos, giveBankPos, {
      delay,
      onComplete: () => {
        if (giveBankEl) {
          giveBankEl.classList.remove('pulse-receive');
          void giveBankEl.offsetWidth;
          giveBankEl.classList.add('pulse-receive');
        }
      }
    });
    delay += 90;
  }

  // Nhận lại từ Ngân hàng (sau một nhịp nhỏ)
  delay += 100;
  for (let i = 0; i < (getCount || 1); i++) {
    spawnFlyingItem(getRes, getBankPos, playerPos, {
      delay,
      onComplete: () => {
        playerEl.classList.remove('pulse-receive');
        void playerEl.offsetWidth;
        playerEl.classList.add('pulse-receive');
      }
    });
    delay += 90;
  }
}

/**
 * 4. Giao dịch giữa 2 người chơi:
 * - Player A chuyển give sang Player B (qua giữa bàn phóng to)
 * - Player B chuyển receive sang Player A (qua giữa bàn phóng to)
 */
export function animatePlayerTrade(playerAId, playerBId, give, receive, getPlayerElementFn) {
  const pAEl = getPlayerElementFn(playerAId);
  const pBEl = getPlayerElementFn(playerBId);
  if (!pAEl || !pBEl) return;

  const rA = pAEl.getBoundingClientRect();
  const rB = pBEl.getBoundingClientRect();
  const posA = { x: rA.left + rA.width / 2, y: rA.top + rA.height / 2 };
  const posB = { x: rB.left + rB.width / 2, y: rB.top + rB.height / 2 };

  let delay = 0;

  // A gửi cho B
  if (give) {
    Object.entries(give).forEach(([res, count]) => {
      for (let i = 0; i < count; i++) {
        spawnFlyingItem(res, posA, posB, {
          delay,
          onComplete: () => {
            pBEl.classList.remove('pulse-receive');
            void pBEl.offsetWidth;
            pBEl.classList.add('pulse-receive');
          }
        });
        delay += 90;
      }
    });
  }

  // B gửi cho A
  if (receive) {
    Object.entries(receive).forEach(([res, count]) => {
      for (let i = 0; i < count; i++) {
        spawnFlyingItem(res, posB, posA, {
          delay,
          onComplete: () => {
            pAEl.classList.remove('pulse-receive');
            void pAEl.offsetWidth;
            pAEl.classList.add('pulse-receive');
          }
        });
        delay += 90;
      }
    });
  }
}

/**
 * 5. Cướp tài nguyên: Nạn nhân -> Giữa bàn Zoom lớn -> Kẻ cướp
 */
export function animateSteal(stealerId, victimId, resourceType, getPlayerElementFn) {
  const victimEl = getPlayerElementFn(victimId);
  const stealerEl = getPlayerElementFn(stealerId);
  if (!victimEl || !stealerEl) return;

  const vR = victimEl.getBoundingClientRect();
  const sR = stealerEl.getBoundingClientRect();

  const startPos = { x: vR.left + vR.width / 2, y: vR.top + vR.height / 2 };
  const targetPos = { x: sR.left + sR.width / 2, y: sR.top + sR.height / 2 };

  spawnFlyingItem(resourceType || 'unknown', startPos, targetPos, {
    label: (resourceType && ITEM_CONFIG[resourceType]) ? `Bị cướp: ${ITEM_CONFIG[resourceType].name}` : 'Bị cướp tài nguyên',
    onComplete: () => {
      stealerEl.classList.remove('pulse-receive');
      void stealerEl.offsetWidth;
      stealerEl.classList.add('pulse-receive');
    }
  });
}

/**
 * 6. Mua Thẻ phát triển: Khay thẻ -> Giữa bàn Zoom lớn -> Người chơi
 */
export function animateDevCardBuy(playerId, cardType, getDevDeckPosFn, getPlayerElementFn) {
  const playerEl = getPlayerElementFn(playerId);
  if (!playerEl) return;

  const pR = playerEl.getBoundingClientRect();
  const targetPos = { x: pR.left + pR.width / 2, y: pR.top + pR.height / 2 };
  const startPos = getDevDeckPosFn() || { x: window.innerWidth - 80, y: window.innerHeight / 2 };

  spawnFlyingItem(cardType || 'dev_card', startPos, targetPos, {
    label: (cardType && ITEM_CONFIG[cardType]) ? ITEM_CONFIG[cardType].name : 'Thẻ phát triển',
    onComplete: () => {
      playerEl.classList.remove('pulse-receive');
      void playerEl.offsetWidth;
      playerEl.classList.add('pulse-receive');
    }
  });
}

/**
 * 7. Đánh Thẻ phát triển: Người chơi -> Giữa bàn Zoom lớn hiển thị hiệu ứng
 */
export function animateDevCardPlay(playerId, cardType, getPlayerElementFn) {
  const playerEl = getPlayerElementFn(playerId);
  const startPos = playerEl
    ? { x: playerEl.getBoundingClientRect().left + playerEl.getBoundingClientRect().width / 2, y: playerEl.getBoundingClientRect().top + playerEl.getBoundingClientRect().height / 2 }
    : { x: 100, y: window.innerHeight / 2 };

  const centerPos = getTableCenterPos();

  spawnFlyingItem(cardType || 'dev_card', startPos, centerPos, {
    label: `Kích hoạt: ${(cardType && ITEM_CONFIG[cardType]) ? ITEM_CONFIG[cardType].name : 'Thẻ bài'}`,
    duration: 1000,
    onComplete: () => {
      spawnImpactRipple(centerPos.x, centerPos.y, ITEM_CONFIG[cardType]?.color || '#f1c40f');
    }
  });
}
