/**
 * CATAN AUDIO SOUND ENGINE
 * Hệ thống âm thanh sống động cho trò chơi Catan Classic Online.
 * Hỗ trợ nạp trước âm thanh, nhóm kênh phát song song (Audio Pool),
 * Web Audio API dự phòng, điều khiển âm lượng và Bật/Tắt (Mute).
 */

// Hệ số giảm 50% toàn bộ âm thanh theo yêu cầu
const MASTER_VOLUME_SCALE = 0.5;

const SOUND_MANIFEST = {
  // 5 loại tài nguyên đặc trưng Catan (giữ nguyên fallback)
  'sheep': '/assets/sounds/r-sheep.mp3',
  'wood': '/assets/sounds/r-wood.mp3',
  'ore': '/assets/sounds/r-rock.mp3',
  'rock': '/assets/sounds/r-rock.mp3',
  'wheat': '/assets/sounds/r-wheat.mp3',
  'clay': '/assets/sounds/r-clay.mp3',

  // Âm thanh nhận tài nguyên nhẹ nhàng, du dương (Gentle Chime / Orb)
  'harvest-gentle': '/assets/sounds/gentle-orb.ogg',
  'gentle-pop': '/assets/sounds/gentle-pop.ogg',

  // Các hành động xây dựng
  'build-settlement': '/assets/sounds/build-settlement.mp3',
  'build-city': '/assets/sounds/build-city.mp3',
  'build-road': '/assets/sounds/build-road.mp3',

  // Giao dịch, tiền và trao đổi
  'trade': '/assets/sounds/coin-fall.mp3',
  'coin-fall': '/assets/sounds/coin-fall.mp3',

  // Xúc xắc & Tên cướp (Tiếng dây xích sắt xủng xoảng ma mị)
  'dice': '/assets/sounds/dice.mp3',
  'robber': '/assets/sounds/chain-rattle.ogg',
  'chain-rattle': '/assets/sounds/chain-rattle.ogg',
  'chain-break': '/assets/sounds/chain-break.ogg',
  'chain-step': '/assets/sounds/chain-step2.ogg',

  // Thẻ phát triển
  'card-draw': '/assets/sounds/card-flip.mp3',
  'card-flip': '/assets/sounds/card-flip.mp3',
  'card-play': '/assets/sounds/card-flip-2.mp3',
  'knight': '/assets/sounds/knight.mp3',

  // Lượt chơi & Trạng thái trò chơi
  'player-turn': '/assets/sounds/player-turn.mp3',
  'victory': '/assets/sounds/game-bonus.mp3',
  'bop': '/assets/sounds/bop.mp3',
  'click': '/assets/sounds/bop.mp3',
  'success': '/assets/sounds/gentle-pop.ogg',
  'fail': '/assets/sounds/fail.mp3',
  'start-end': '/assets/sounds/start-end.mp3'
};

export class SoundEngine {
  constructor(options = {}) {
    this.options = {
      defaultVolume: 0.5, // Giảm 50% âm lượng mặc định
      poolSize: 3, // Số lượng instance đồng thời cho mỗi file để không bị ngắt tiếng
      ...options
    };

    this.muted = localStorage.getItem('catan_sound_muted') === 'true';
    this.volume = parseFloat(localStorage.getItem('catan_sound_volume') || String(this.options.defaultVolume));
    if (isNaN(this.volume)) this.volume = 0.5;

    this.audioPools = new Map();
    this.isUnlocked = false;
    this.listeners = new Set();

    this.initAudioUnlock();
    this.preloadSounds();
  }

  /**
   * Mở khóa AudioContext và quyền phát âm thanh khi người dùng tương tác lần đầu
   */
  initAudioUnlock() {
    const unlock = () => {
      if (this.isUnlocked) return;
      this.isUnlocked = true;

      // Kích hoạt một audio ngắn không tiếng để trình duyệt mở quyền
      try {
        const dummy = new Audio();
        dummy.volume = 0;
        dummy.play().catch(() => {});
      } catch (_) {}

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  /**
   * Nạp sẵn các file âm thanh vào Audio Pool
   */
  preloadSounds() {
    if (typeof window === 'undefined' || !window.Audio) return;

    Object.entries(SOUND_MANIFEST).forEach(([name, url]) => {
      if (this.audioPools.has(name)) return;
      const pool = [];
      for (let i = 0; i < this.options.poolSize; i++) {
        try {
          const audio = new Audio(url);
          audio.preload = 'auto';
          audio.volume = this.volume;
          pool.push(audio);
        } catch (_) {}
      }
      this.audioPools.set(name, pool);
    });
  }

  /**
   * Phát một âm thanh theo tên
   * @param {string} name Tên âm thanh trong manifest
   * @param {object} opts { volume, rate, delay }
   */
  play(name, opts = {}) {
    if (this.muted || this.volume <= 0.001) return;

    const playFn = () => {
      const baseVol = (opts.volume !== undefined ? opts.volume : this.volume);
      // Nút bấm UI ('bop') nhỏ lại 75% (chỉ còn 25% âm lượng) theo yêu cầu
      const soundScale = (name === 'bop' && opts.volume === undefined) ? 0.25 : 1.0;
      // Áp dụng hệ số Master Volume giảm 50%
      const finalVolume = Math.max(0, Math.min(1, baseVol * MASTER_VOLUME_SCALE * soundScale));

      const pool = this.audioPools.get(name);
      if (!pool || pool.length === 0) {
        // Fallback tạo audio mới nếu chưa có trong pool
        const url = SOUND_MANIFEST[name];
        if (!url) return;
        try {
          const a = new Audio(url);
          a.volume = finalVolume;
          if (opts.rate) a.playbackRate = opts.rate;
          a.play().catch(() => {});
        } catch (_) {}
        return;
      }

      // Tìm một audio rảnh rỗi hoặc đã phát xong
      let audio = pool.find(a => a.paused || a.ended);
      if (!audio) {
        audio = pool[0]; // Nếu đang bận hết thì dùng lại phần tử đầu
      }

      try {
        audio.currentTime = 0;
        audio.volume = finalVolume;
        if (opts.rate) audio.playbackRate = opts.rate;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }

        // Hỗ trợ dừng âm thanh sớm với hiệu ứng fade out êm ái (cho các âm xây nhà ngắn hơn)
        if (opts.duration && opts.duration > 0) {
          const durationMs = opts.duration * 1000;
          setTimeout(() => {
            try {
              const step = audio.volume / 3;
              let count = 0;
              const fader = setInterval(() => {
                count++;
                if (audio.volume > step && count < 3) {
                  audio.volume -= step;
                } else {
                  clearInterval(fader);
                  audio.pause();
                  audio.currentTime = 0;
                }
              }, 25);
            } catch (_) {
              audio.pause();
              audio.currentTime = 0;
            }
          }, durationMs);
        }
      } catch (_) {}
    };

    if (opts.delay && opts.delay > 0) {
      setTimeout(playFn, opts.delay);
    } else {
      playFn();
    }
  }

  /**
   * Phát âm thanh tài nguyên nhận được nhẹ nhàng, du dương theo cao độ êm tai
   * @param {string} resType Loại tài nguyên (sheep, wood, ore, wheat, clay)
   * @param {number} delay Độ trễ (ms)
   */
  playResource(resType, delay = 0) {
    if (!resType) return;
    const key = String(resType).toLowerCase().trim();
    const pitchMap = {
      wood: 0.88,
      clay: 1.0,
      sheep: 1.15,
      wheat: 1.3,
      ore: 1.48,
      rock: 1.48
    };
    const pitch = pitchMap[key] || 1.0;
    // Âm thanh nhận tài nguyên nhẹ nhàng, êm dịu, không chói tai
    this.play('harvest-gentle', {
      delay,
      rate: pitch,
      volume: this.volume * 0.75
    });
  }

  /**
   * Phát chuỗi âm thanh tài nguyên so le nhịp nhàng khi thu hoạch nhiều loại cùng lúc
   * @param {string[]} resourceList Danh sách các loại tài nguyên nhận được
   * @param {number} staggerMs Khoảng cách giữa các âm thanh (mặc định 160ms)
   */
  playResourcesStaggered(resourceList, staggerMs = 160) {
    if (!Array.isArray(resourceList) || resourceList.length === 0) return;
    const uniqueResources = [...new Set(resourceList.filter(Boolean))];
    uniqueResources.forEach((res, index) => {
      this.playResource(res, index * staggerMs);
    });
  }

  /**
   * Phát âm thanh công trình xây dựng (Ngắn gọn, dứt khoát)
   * @param {'settlement'|'city'|'road'} type 
   */
  playBuild(type) {
    if (type === 'settlement') {
      // Âm thanh xây nhà ngắn hơn (0.65 giây, tốc độ gõ nhịp nhanh hơn)
      this.play('build-settlement', { duration: 0.65, rate: 1.35 });
    } else if (type === 'city') {
      // Âm thanh nâng cấp thành phố ngắn gọn (0.75 giây)
      this.play('build-city', { duration: 0.75, rate: 1.3 });
    } else if (type === 'road') {
      // Đặt đường ngắn gọn (0.5 giây)
      this.play('build-road', { duration: 0.5, rate: 1.15 });
    }
  }

  /**
   * Phát âm thanh trao đổi / buôn bán ngân hàng hoặc giữa người chơi
   */
  playTrade() {
    this.play('trade');
  }

  /**
   * Phát âm thanh Tên cướp (Tiếng dây xích sắt xủng xoảng ma mị)
   */
  playRobber() {
    this.play('chain-rattle', { rate: 0.95, volume: this.volume * 0.9 });
    this.play('chain-break', { delay: 95, rate: 1.05, volume: this.volume * 0.75 });
  }

  /**
   * Phát âm thanh gieo xúc xắc
   */
  playDice() {
    this.play('dice');
  }

  /**
   * Phát âm thanh rút hoặc mua thẻ phát triển
   */
  playCardDraw() {
    this.play('card-draw');
  }

  /**
   * Phát âm thanh đánh thẻ phát triển (Hiệp sĩ hoặc thẻ thưởng)
   */
  playCardPlay(cardType) {
    if (cardType === 'knight') {
      this.play('knight');
    } else {
      this.play('card-play');
    }
  }

  /**
   * Phát âm thanh thông báo đến lượt của bạn
   */
  playTurnNotification() {
    this.play('player-turn');
  }

  /**
   * Phát âm thanh chiến thắng ván đấu
   */
  playVictory() {
    this.play('victory');
  }

  /**
   * Phát âm thanh nút bấm UI / Click (nhỏ lại 75%, chỉ còn 25% âm lượng, rất êm ái)
   */
  playBop() {
    this.play('bop', { volume: this.volume * 0.25 });
  }

  /**
   * Phát âm thanh click nút bấm UI
   */
  playClick() {
    this.playBop();
  }

  /**
   * Phát âm thanh thành công nhẹ nhàng (Gentle Pop / Chime)
   */
  playSuccess(opts = {}) {
    this.play('gentle-pop', { rate: 1.15, volume: this.volume * 0.75, ...opts });
  }

  /**
   * Phát âm thanh đổi màu quân cờ nhẹ nhàng, êm dịu, sinh động theo từng màu
   * @param {string} colorHex Mã màu hex
   */
  playColorChange(colorHex) {
    const pitchMap = {
      '#e74c3c': 0.95, // Đỏ (ấm)
      '#3498db': 1.18, // Xanh dương (trong trẻo)
      '#e67e22': 1.05, // Cam (sáng)
      '#ecf0f1': 1.35, // Trắng (thanh thoát)
      '#2ecc71': 1.25, // Xanh lá (tươi mát)
      '#9b59b6': 1.10  // Tím (huyền bí)
    };
    const rate = (colorHex && pitchMap[colorHex.toLowerCase()]) || 1.15;
    this.play('gentle-pop', { rate, volume: this.volume * 0.8 });
  }

  /**
   * Phát âm thanh thao tác lỗi / không hợp lệ
   */
  playFail() {
    this.play('fail', { volume: 0.5 });
  }

  /**
   * Bật / Tắt âm thanh (Mute Toggle)
   * @returns {boolean} Trạng thái tắt tiếng hiện tại
   */
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('catan_sound_muted', String(this.muted));
    this.notifyListeners();
    return this.muted;
  }

  setMute(isMuted) {
    this.muted = Boolean(isMuted);
    localStorage.setItem('catan_sound_muted', String(this.muted));
    this.notifyListeners();
  }

  isMuted() {
    return this.muted;
  }

  /**
   * Điều chỉnh âm lượng chung (0.0 đến 1.0)
   * @param {number} val
   */
  setVolume(val) {
    const num = Math.max(0, Math.min(1, parseFloat(val) || 0));
    this.volume = num;
    if (this.volume === 0) {
      this.muted = true;
    } else if (this.muted && this.volume > 0) {
      this.muted = false;
    }
    localStorage.setItem('catan_sound_volume', String(this.volume));
    localStorage.setItem('catan_sound_muted', String(this.muted));
    this.audioPools.forEach(pool => {
      pool.forEach(audio => {
        audio.volume = this.volume;
      });
    });
    this.notifyListeners();
  }

  getVolume() {
    return this.volume;
  }

  /**
   * Lấy biểu tượng loa phù hợp theo mức âm lượng hiện tại
   */
  getVolumeIcon() {
    if (this.muted || this.volume === 0) return '🔇';
    if (this.volume < 0.35) return '🔈';
    if (this.volume < 0.7) return '🔉';
    return '🔊';
  }

  /**
   * Đăng ký lắng nghe thay đổi trạng thái Mute / Volume để cập nhật UI nút loa
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
  }

  notifyListeners() {
    this.listeners.forEach(fn => {
      try {
        fn({ muted: this.muted, volume: this.volume });
      } catch (_) {}
    });
  }
}

// Khởi tạo một singleton SoundEngine duy nhất cho ứng dụng
export const sound = new SoundEngine();
