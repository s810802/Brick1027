/**
 * 經典打磚塊 (Brick Breaker) - 主遊戲引擎與渲染系統
 * 純 JavaScript Canvas 2D 渲染，包含高禎率物理、粒子系統、手勢/鍵盤操作與狀態管理
 */

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PADDLE_DEFAULT_WIDTH,
  PADDLE_EXPANDED_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  BALL_RADIUS,
  BALL_INITIAL_SPEED,
  BALL_MAX_SPEED,
  BALL_SPEED_INCREMENT,
  POWERUP_TYPES,
  LEVELS,
  createBricksForLevel,
  getRemainingBreakableCount,
  resolvePaddleBallCollision,
  checkBallBrickCollision,
  calculateComboScore,
  getBombExplosionTargets
} from './rules.js';

import { sounds } from './audio.js';

export class BrickBreakerEngine {
  constructor(canvas, uiHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.uiHooks = uiHooks;

    // 支援高解析度 Retina / HiDPI 螢幕
    this.dpr = window.devicePixelRatio || 1;

    // 遊戲核心狀態
    this.state = 'title'; // 'title' | 'playing' | 'paused' | 'gameover' | 'victory'
    this.currentLevel = 0;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('brick_breaker_high_score') || '0', 10);
    this.lives = 3;
    this.maxLives = 5;
    this.combo = 1;
    this.maxCombo = 1;
    this.totalBricksDestroyed = 0;

    // 球拍
    this.paddle = {
      x: (CANVAS_WIDTH - PADDLE_DEFAULT_WIDTH) / 2,
      y: CANVAS_HEIGHT - 38,
      width: PADDLE_DEFAULT_WIDTH,
      height: PADDLE_HEIGHT,
      targetX: (CANVAS_WIDTH - PADDLE_DEFAULT_WIDTH) / 2,
      vx: 0,
      squash: 1, // 撞擊擠壓視覺
      stretch: 1
    };

    // 球集合 (支援多球分身)
    this.balls = [];

    // 磚塊陣列
    this.bricks = [];
    this.levelName = '';
    this.levelSubtitle = '';

    // 道具與特效
    this.powerups = [];
    this.activePowerups = {
      expand: 0,
      laser: 0,
      fireball: 0,
      slow: 0,
      shield: false
    };
    this.laserCooldown = 0;
    this.lasers = [];

    // 粒子系統 (零 GC 限制池)
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];

    // 震屏創傷值 (Camera Trauma)
    this.trauma = 0;

    // 操作輸入監聽
    this.keys = {
      left: false,
      right: false,
      space: false
    };
    this.pointerActive = false;

    // 時間迴圈計時
    this.lastTime = performance.now();
    this.animId = null;

    this.initCanvasSize();
    this.bindEvents();
    this.setupLevel(0);
    this.syncHUD();
  }

  initCanvasSize() {
    this.canvas.width = Math.round(CANVAS_WIDTH * this.dpr);
    this.canvas.height = Math.round(CANVAS_HEIGHT * this.dpr);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
    });

    // 鍵盤操作
    window.addEventListener('keydown', (e) => {
      sounds.ensureUnlocked();

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this.keys.left = true;
        this.pointerActive = false;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this.keys.right = true;
        this.pointerActive = false;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.keys.space = true;
        if (this.state === 'title') {
          this.startGame();
        } else if (this.state === 'playing') {
          this.launchHeldBalls();
          this.fireLasers();
        }
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'playing') {
          this.pauseGame();
        } else if (this.state === 'paused') {
          this.resumeGame();
        }
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        const isMuted = sounds.toggleMute();
        this.uiHooks.onMuteToggle?.(isMuted);
      }
      if (e.code === 'KeyR') {
        if (this.state === 'playing' || this.state === 'paused') {
          e.preventDefault();
          this.restartGame();
        }
      }
      if (e.code === 'Enter') {
        if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory') {
          e.preventDefault();
          this.startGame();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'Space') this.keys.space = false;
    });

    // 滑鼠與指標操作 (以 Canvas 實際縮放比例計算精確座標)
    const handlePointerMove = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const canvasX = (clientX - rect.left) * scaleX;
      this.paddle.targetX = Math.max(0, Math.min(CANVAS_WIDTH - this.paddle.width, canvasX - this.paddle.width / 2));
      this.pointerActive = true;
    };

    this.canvas.addEventListener('mousemove', (e) => {
      sounds.ensureUnlocked();
      handlePointerMove(e.clientX);
    });

    this.canvas.addEventListener('click', () => {
      sounds.ensureUnlocked();
      if (this.state === 'playing') {
        this.launchHeldBalls();
        this.fireLasers();
      }
    });

    // 觸控支援
    this.canvas.addEventListener('touchstart', (e) => {
      sounds.ensureUnlocked();
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
        if (this.state === 'playing') {
          this.launchHeldBalls();
          this.fireLasers();
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    }, { passive: true });

    // 視窗失焦時釋放按鍵
    window.addEventListener('blur', () => {
      this.keys.left = false;
      this.keys.right = false;
      this.keys.space = false;
    });
  }

  setupLevel(levelIndex) {
    this.currentLevel = levelIndex % LEVELS.length;
    const levelData = createBricksForLevel(this.currentLevel);
    this.bricks = levelData.bricks;
    this.levelName = levelData.name;
    this.levelSubtitle = levelData.subtitle;

    // 重設道具狀態
    this.powerups = [];
    this.activePowerups = {
      expand: 0,
      laser: 0,
      fireball: 0,
      slow: 0,
      shield: false
    };
    this.lasers = [];
    this.combo = 1;

    // 重置球拍寬度
    this.paddle.width = PADDLE_DEFAULT_WIDTH;
    this.paddle.x = (CANVAS_WIDTH - this.paddle.width) / 2;
    this.paddle.targetX = this.paddle.x;

    // 生成起始球 (黏在球拍上方)
    this.resetBallOnPaddle();

    // 關卡浮動公告
    this.addFloatingText(`${this.levelName}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20, '#38bdf8', 32, 2.5);
    this.addFloatingText(`${this.levelSubtitle}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25, '#94a3b8', 16, 2.5);

    this.syncHUD();
  }

  resetBallOnPaddle() {
    this.balls = [
      {
        x: this.paddle.x + this.paddle.width / 2,
        y: this.paddle.y - BALL_RADIUS - 1,
        radius: BALL_RADIUS,
        vx: 0,
        vy: 0,
        speed: BALL_INITIAL_SPEED,
        stuck: true,
        stuckOffset: this.paddle.width / 2,
        fireball: false
      }
    ];
  }

  getLaunchAngle() {
    let bias = 0;
    if (this.keys.left) bias -= 0.28;
    if (this.keys.right) bias += 0.28;
    if (this.pointerActive && Math.abs(this.paddle.targetX - this.paddle.x) > 2) {
      bias += Math.max(-0.35, Math.min(0.35, (this.paddle.targetX - this.paddle.x) * 0.03));
    }
    return bias;
  }

  launchHeldBalls() {
    let launched = false;
    const baseAngle = this.getLaunchAngle();
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.stuck = false;
        // 向上發射：0 弧度為筆直向上，加入微幅角度偏轉 (-20° ~ +20°)
        const angle = baseAngle + (Math.random() * 0.2 - 0.1);
        ball.vx = ball.speed * Math.sin(angle);
        ball.vy = -Math.abs(ball.speed * Math.cos(angle)); // 確保 vy 一定為負值 (向上朝磚塊飛行)
        launched = true;
      }
    }
    if (launched) {
      sounds.playPaddleBounce();
    }
  }

  fireLasers() {
    if (this.activePowerups.laser <= 0) return;
    if (this.laserCooldown > 0) return;

    this.laserCooldown = 0.25; // 射擊冷卻
    sounds.playLaserShot();

    const leftX = this.paddle.x + 8;
    const rightX = this.paddle.x + this.paddle.width - 8;
    const y = this.paddle.y - 4;

    this.lasers.push(
      { x: leftX, y, vy: -750, width: 4, height: 16, color: '#f43f5e' },
      { x: rightX, y, vy: -750, width: 4, height: 16, color: '#f43f5e' }
    );
  }

  startGame() {
    this.state = 'playing';
    document.body.dataset.state = 'playing';
    this.score = 0;
    this.lives = 3;
    this.totalBricksDestroyed = 0;
    this.maxCombo = 1;
    this.setupLevel(0);
    this.uiHooks.onStateChange?.(this.state);
    sounds.ensureUnlocked();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.body.dataset.state = 'paused';
    this.uiHooks.onStateChange?.(this.state);
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.body.dataset.state = 'playing';
    this.lastTime = performance.now();
    this.uiHooks.onStateChange?.(this.state);
  }

  restartGame() {
    this.startGame();
  }

  triggerVictory() {
    this.state = 'victory';
    document.body.dataset.state = 'gameover';
    sounds.playLevelClear();
    this.saveHighScore();
    this.uiHooks.onStateChange?.(this.state, {
      score: this.score,
      highScore: this.highScore,
      maxCombo: this.maxCombo,
      destroyed: this.totalBricksDestroyed
    });
  }

  triggerGameOver() {
    this.state = 'gameover';
    document.body.dataset.state = 'gameover';
    sounds.playGameOver();
    this.saveHighScore();
    this.uiHooks.onStateChange?.(this.state, {
      score: this.score,
      highScore: this.highScore,
      maxCombo: this.maxCombo,
      destroyed: this.totalBricksDestroyed
    });
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('brick_breaker_high_score', String(this.highScore));
    }
    this.syncHUD();
  }

  syncHUD() {
    this.uiHooks.onStatsUpdate?.({
      score: this.score,
      highScore: this.highScore,
      lives: this.lives,
      maxLives: this.maxLives,
      levelIndex: this.currentLevel + 1,
      levelName: this.levelName,
      combo: this.combo,
      activePowerups: this.activePowerups
    });
  }

  /**
   * 道具掉落機率判定與產生
   */
  spawnPowerup(x, y) {
    // 25% 機率掉落道具
    if (Math.random() > 0.25) return;

    const types = [
      POWERUP_TYPES.MULTIBALL,
      POWERUP_TYPES.EXPAND,
      POWERUP_TYPES.LASER,
      POWERUP_TYPES.FIREBALL,
      POWERUP_TYPES.SLOW,
      POWERUP_TYPES.SHIELD,
      POWERUP_TYPES.LIFE
    ];

    // 加權隨機
    const weights = [0.22, 0.20, 0.16, 0.14, 0.14, 0.08, 0.06];
    let rand = Math.random();
    let chosen = types[0];
    for (let i = 0; i < weights.length; i++) {
      if (rand < weights[i]) {
        chosen = types[i];
        break;
      }
      rand -= weights[i];
    }

    this.powerups.push({
      x: x + 10,
      y: y + 5,
      width: 32,
      height: 22,
      vy: 140, // 下落速度
      type: chosen.id,
      name: chosen.name,
      icon: chosen.icon,
      color: chosen.color
    });
  }

  applyPowerup(powerup) {
    sounds.playPowerupCollect();
    this.addFloatingText(`${powerup.name}!`, powerup.x, powerup.y - 10, powerup.color, 18, 1.2);

    switch (powerup.type) {
      case 'multiball': {
        // 將現有球分裂成三顆
        const newBalls = [];
        for (const ball of this.balls) {
          if (ball.stuck) continue;
          newBalls.push(
            {
              x: ball.x,
              y: ball.y,
              vx: ball.vx * 0.9 - 140,
              vy: ball.vy * 0.9,
              radius: ball.radius,
              speed: ball.speed,
              stuck: false,
              fireball: ball.fireball
            },
            {
              x: ball.x,
              y: ball.y,
              vx: ball.vx * 0.9 + 140,
              vy: ball.vy * 0.9,
              radius: ball.radius,
              speed: ball.speed,
              stuck: false,
              fireball: ball.fireball
            }
          );
        }
        if (newBalls.length === 0) {
          this.resetBallOnPaddle();
        } else {
          this.balls.push(...newBalls.slice(0, 6)); // 最多同時 6 顆球避免過載
        }
        break;
      }
      case 'expand': {
        this.activePowerups.expand = 12;
        this.paddle.width = PADDLE_EXPANDED_WIDTH;
        break;
      }
      case 'laser': {
        this.activePowerups.laser = 10;
        break;
      }
      case 'fireball': {
        this.activePowerups.fireball = 8;
        for (const ball of this.balls) {
          ball.fireball = true;
        }
        break;
      }
      case 'slow': {
        this.activePowerups.slow = 10;
        for (const ball of this.balls) {
          ball.speed = Math.max(BALL_INITIAL_SPEED * 0.75, ball.speed * 0.75);
          const currentSpd = Math.hypot(ball.vx, ball.vy);
          if (currentSpd > 0) {
            ball.vx = (ball.vx / currentSpd) * ball.speed;
            ball.vy = (ball.vy / currentSpd) * ball.speed;
          }
        }
        break;
      }
      case 'shield': {
        this.activePowerups.shield = true;
        break;
      }
      case 'life': {
        if (this.lives < this.maxLives) {
          this.lives++;
        }
        break;
      }
    }

    this.syncHUD();
  }

  /**
   * 建立磚塊破碎粒子特效
   */
  spawnBrickParticles(brick, count = 14) {
    const cx = brick.x + brick.width / 2;
    const cy = brick.y + brick.height / 2;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 220 + 60;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        color: brick.color,
        size: Math.random() * 4 + 2,
        life: 0.6,
        maxLife: 0.6
      });
    }
  }

  addFloatingText(text, x, y, color = '#ffffff', size = 16, duration = 1.0) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      size,
      life: duration,
      maxLife: duration
    });
  }

  addShockwave(x, y, color = 'rgba(239, 68, 68, 0.8)') {
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius: 120,
      color,
      life: 0.45,
      maxLife: 0.45
    });
  }

  hitBrick(brick, isPiercing = false) {
    if (!brick.alive) return;

    if (brick.type === 'gold') {
      // 金磚不可摧毀，僅反彈並飄出火花
      sounds.playWallBounce();
      this.spawnBrickParticles(brick, 6);
      return;
    }

    brick.hitsRemaining--;

    if (brick.hitsRemaining <= 0) {
      brick.alive = false;
      this.totalBricksDestroyed++;

      // 計分與連擊
      const addedScore = calculateComboScore(brick.score, this.combo);
      this.score += addedScore;
      this.saveHighScore();

      this.addFloatingText(
        this.combo > 1 ? `+${addedScore} (x${this.combo})` : `+${addedScore}`,
        brick.x + brick.width / 2,
        brick.y,
        this.combo > 2 ? '#f59e0b' : '#38bdf8',
        this.combo > 2 ? 18 : 14,
        0.8
      );

      this.spawnBrickParticles(brick, 16);
      sounds.playBrickBreak();

      // 若為炸彈磚塊，引爆周遭
      if (brick.type === 'bomb') {
        this.triggerBomb(brick);
      } else {
        this.spawnPowerup(brick.x, brick.y);
      }

      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    } else {
      // 磚塊受創但未破裂
      sounds.playBrickHit(this.combo);
      this.spawnBrickParticles(brick, 6);
    }

    this.syncHUD();
    this.checkLevelClear();
  }

  triggerBomb(bombBrick) {
    sounds.playExplosion();
    this.trauma = Math.min(1.0, this.trauma + 0.6);
    this.addShockwave(bombBrick.x + bombBrick.width / 2, bombBrick.y + bombBrick.height / 2);

    const targets = getBombExplosionTargets(bombBrick, this.bricks);
    for (const target of targets) {
      // 炸彈直接瓦解目標
      target.hitsRemaining = 0;
      target.alive = false;
      this.totalBricksDestroyed++;
      const score = calculateComboScore(target.score, this.combo);
      this.score += score;
      this.spawnBrickParticles(target, 12);
      this.spawnPowerup(target.x, target.y);
    }
  }

  checkLevelClear() {
    const breakableLeft = getRemainingBreakableCount(this.bricks);
    if (breakableLeft === 0) {
      // 關卡過關！
      sounds.playLevelClear();
      this.addFloatingText('關卡完成！STAGE CLEAR!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, '#4ade80', 28, 2.0);

      setTimeout(() => {
        if (this.currentLevel + 1 < LEVELS.length) {
          this.setupLevel(this.currentLevel + 1);
        } else {
          this.triggerVictory();
        }
      }, 1500);
    }
  }

  /**
   * 主更新迴圈
   */
  update(dt) {
    if (this.state !== 'playing') return;

    // 震屏創傷值衰減
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }

    // 道具持續時間更新
    if (this.activePowerups.expand > 0) {
      this.activePowerups.expand -= dt;
      if (this.activePowerups.expand <= 0) {
        this.paddle.width = PADDLE_DEFAULT_WIDTH;
      }
    }

    if (this.activePowerups.laser > 0) {
      this.activePowerups.laser -= dt;
      if (this.laserCooldown > 0) {
        this.laserCooldown -= dt;
      }
    }

    if (this.activePowerups.fireball > 0) {
      this.activePowerups.fireball -= dt;
      if (this.activePowerups.fireball <= 0) {
        for (const ball of this.balls) {
          ball.fireball = false;
        }
      }
    }

    if (this.activePowerups.slow > 0) {
      this.activePowerups.slow -= dt;
    }

    // 球拍移動 (滑鼠跟隨與鍵盤平滑加速度)
    if (this.pointerActive) {
      const dx = this.paddle.targetX - this.paddle.x;
      this.paddle.x += dx * Math.min(1.0, dt * 25);
    } else {
      let moveDir = 0;
      if (this.keys.left) moveDir -= 1;
      if (this.keys.right) moveDir += 1;

      this.paddle.x += moveDir * PADDLE_SPEED * dt;
    }

    // 限制球拍於畫布邊界內
    this.paddle.x = Math.max(0, Math.min(CANVAS_WIDTH - this.paddle.width, this.paddle.x));

    // 球拍擠壓彈性恢復
    this.paddle.squash += (1 - this.paddle.squash) * Math.min(1.0, dt * 15);
    this.paddle.stretch += (1 - this.paddle.stretch) * Math.min(1.0, dt * 15);

    // 更新雷射飛彈
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y += laser.vy * dt;

      // 檢查雷射擊中磚塊
      let laserHit = false;
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        if (
          laser.x < brick.x + brick.width &&
          laser.x + laser.width > brick.x &&
          laser.y < brick.y + brick.height &&
          laser.y + laser.height > brick.y
        ) {
          this.hitBrick(brick);
          laserHit = true;
          break;
        }
      }

      if (laserHit || laser.y < -20) {
        this.lasers.splice(i, 1);
      }
    }

    // 更新掉落道具
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += p.vy * dt;

      // 檢查是否被球拍接住
      if (
        p.y + p.height >= this.paddle.y &&
        p.y <= this.paddle.y + this.paddle.height &&
        p.x + p.width >= this.paddle.x &&
        p.x <= this.paddle.x + this.paddle.width
      ) {
        this.applyPowerup(p);
        this.powerups.splice(i, 1);
        continue;
      }

      // 超出底端移除
      if (p.y > CANVAS_HEIGHT + 20) {
        this.powerups.splice(i, 1);
      }
    }

    // 更新所有球的物理與碰撞
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      // 若球黏在球拍上
      if (ball.stuck) {
        ball.x = this.paddle.x + (ball.stuckOffset || this.paddle.width / 2);
        ball.y = this.paddle.y - ball.radius - 1;
        continue;
      }

      // 火球尾跡粒子
      if (ball.fireball || this.activePowerups.fireball > 0) {
        ball.fireball = true;
        this.particles.push({
          x: ball.x + (Math.random() * 6 - 3),
          y: ball.y + (Math.random() * 6 - 3),
          vx: -ball.vx * 0.15,
          vy: -ball.vy * 0.15,
          color: Math.random() > 0.5 ? '#f97316' : '#ef4444',
          size: Math.random() * 5 + 3,
          life: 0.25,
          maxLife: 0.25
        });
      }

      // 位移
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // 左/右牆壁碰撞
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        sounds.playWallBounce();
      } else if (ball.x + ball.radius >= CANVAS_WIDTH) {
        ball.x = CANVAS_WIDTH - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        sounds.playWallBounce();
      }

      // 頂部天花板碰撞
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        sounds.playWallBounce();
      }

      // 底部護盾防線碰撞
      if (this.activePowerups.shield && ball.y + ball.radius >= CANVAS_HEIGHT - 8) {
        ball.vy = -Math.abs(ball.vy);
        ball.y = CANVAS_HEIGHT - 8 - ball.radius;
        this.activePowerups.shield = false; // 抵擋一次後消耗
        sounds.playPaddleBounce();
        this.addFloatingText('護盾抵擋！', ball.x, CANVAS_HEIGHT - 30, '#06b6d4', 16, 1.2);
        this.addShockwave(ball.x, CANVAS_HEIGHT - 8, 'rgba(6, 182, 212, 0.9)');
        this.syncHUD();
        continue;
      }

      // 球拍碰撞檢查
      if (resolvePaddleBallCollision(ball, this.paddle)) {
        // 連擊重置
        this.combo = 1;
        this.paddle.squash = 0.8;
        this.paddle.stretch = 1.2;
        sounds.playPaddleBounce();

        // 稍微提升球速
        if (ball.speed < BALL_MAX_SPEED) {
          ball.speed += BALL_SPEED_INCREMENT;
        }

        // 碰撞火花
        for (let p = 0; p < 6; p++) {
          this.particles.push({
            x: ball.x,
            y: this.paddle.y,
            vx: (Math.random() - 0.5) * 160,
            vy: -Math.random() * 120 - 40,
            color: '#38bdf8',
            size: 3,
            life: 0.3,
            maxLife: 0.3
          });
        }
        continue;
      }

      // 磚塊碰撞檢查
      for (const brick of this.bricks) {
        if (!brick.alive) continue;
        const col = checkBallBrickCollision(ball, brick);

        if (col) {
          if (!ball.fireball) {
            // 一般球反彈
            if (col.side === 'left') {
              ball.vx = -Math.abs(ball.vx);
              ball.x = brick.x - ball.radius - 1;
            } else if (col.side === 'right') {
              ball.vx = Math.abs(ball.vx);
              ball.x = brick.x + brick.width + ball.radius + 1;
            } else if (col.side === 'top') {
              ball.vy = -Math.abs(ball.vy);
              ball.y = brick.y - ball.radius - 1;
            } else if (col.side === 'bottom') {
              ball.vy = Math.abs(ball.vy);
              ball.y = brick.y + brick.height + ball.radius + 1;
            }
          }

          this.hitBrick(brick, ball.fireball);
          break; // 一個球每禎最多處理一個磚塊碰撞避免卡點
        }
      }

      // 檢查球落入底端死亡線
      if (ball.y - ball.radius > CANVAS_HEIGHT) {
        this.balls.splice(i, 1);
      }
    }

    // 若所有球皆遺失，扣除一條命
    if (this.balls.length === 0) {
      this.lives--;
      this.trauma = 0.8;
      sounds.playLifeLost();
      this.syncHUD();

      if (this.lives > 0) {
        this.resetBallOnPaddle();
      } else {
        this.triggerGameOver();
      }
    }

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // 微重力
    }

    // 更新浮動文字
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y -= 35 * dt; // 向上飄浮
    }

    // 更新震波
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - (sw.life / sw.maxLife);
      sw.radius = sw.maxRadius * progress;
    }
  }

  /**
   * 主渲染繪製
   */
  render() {
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);

    // 震屏位移 (Trauma Shake)
    if (this.trauma > 0) {
      const shakeMagnitude = this.trauma * this.trauma * 16;
      const offsetX = (Math.random() * 2 - 1) * shakeMagnitude;
      const offsetY = (Math.random() * 2 - 1) * shakeMagnitude;
      this.ctx.translate(offsetX, offsetY);
    }

    // 畫布背景清除 (深色霓虹網格背景)
    this.ctx.fillStyle = '#080d1a';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 繪製科技網格背景線
    this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    this.ctx.lineWidth = 1;
    for (let x = 40; x < CANVAS_WIDTH; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, CANVAS_HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 40; y < CANVAS_HEIGHT; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(CANVAS_WIDTH, y);
      this.ctx.stroke();
    }

    // 護盾防線渲染
    if (this.activePowerups.shield) {
      this.ctx.save();
      this.ctx.strokeStyle = '#06b6d4';
      this.ctx.lineWidth = 4;
      this.ctx.shadowColor = '#06b6d4';
      this.ctx.shadowBlur = 12;
      this.ctx.beginPath();
      this.ctx.moveTo(0, CANVAS_HEIGHT - 6);
      this.ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 6);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 繪製磚塊
    for (const b of this.bricks) {
      if (!b.alive) continue;
      this.drawBrick(b);
    }

    // 繪製掉落道具
    for (const p of this.powerups) {
      this.drawPowerup(p);
    }

    // 繪製雷射子彈
    for (const laser of this.lasers) {
      this.ctx.save();
      this.ctx.fillStyle = laser.color;
      this.ctx.shadowColor = laser.color;
      this.ctx.shadowBlur = 10;
      this.ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
      this.ctx.restore();
    }

    // 繪製球拍
    this.drawPaddle();

    // 繪製球
    for (const ball of this.balls) {
      this.drawBall(ball);
    }

    // 繪製衝擊波
    for (const sw of this.shockwaves) {
      const alpha = (sw.life / sw.maxLife) * 0.8;
      this.ctx.save();
      this.ctx.strokeStyle = sw.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 繪製粒子
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 6;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // 繪製浮動文字
    for (const ft of this.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = ft.color;
      this.ctx.font = `bold ${ft.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
      this.ctx.shadowBlur = 6;
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  drawPaddle() {
    const p = this.paddle;
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.scale(p.stretch, p.squash);

    const rx = -p.width / 2;
    const ry = -p.height / 2;
    const radius = 6;

    // 球拍外光暈
    this.ctx.shadowColor = this.activePowerups.laser > 0 ? '#f43f5e' : '#38bdf8';
    this.ctx.shadowBlur = 14;

    // 球拍漸層填色
    const grad = this.ctx.createLinearGradient(0, ry, 0, ry + p.height);
    if (this.activePowerups.laser > 0) {
      grad.addColorStop(0, '#fda4af');
      grad.addColorStop(1, '#e11d48');
    } else {
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(1, '#0284c7');
    }
    this.ctx.fillStyle = grad;

    // 圓角矩形
    this.ctx.beginPath();
    this.ctx.roundRect(rx, ry, p.width, p.height, radius);
    this.ctx.fill();

    // 頂部高光線
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(rx + 8, ry + 2);
    this.ctx.lineTo(rx + p.width - 8, ry + 2);
    this.ctx.stroke();

    // 若有雷射道具，繪製砲管
    if (this.activePowerups.laser > 0) {
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.fillRect(rx + 4, ry - 6, 6, 6);
      this.ctx.fillRect(rx + p.width - 10, ry - 6, 6, 6);
    }

    this.ctx.restore();
  }

  drawBrick(b) {
    this.ctx.save();
    const radius = 4;

    // 磚塊陰影與光暈
    this.ctx.shadowColor = b.glow;
    this.ctx.shadowBlur = 8;

    // 漸層填色
    const grad = this.ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, '#0f172a');
    this.ctx.fillStyle = grad;

    this.ctx.beginPath();
    this.ctx.roundRect(b.x, b.y, b.width, b.height, radius);
    this.ctx.fill();

    // 磚塊邊框
    this.ctx.strokeStyle = b.color;
    this.ctx.lineWidth = 1.2;
    this.ctx.stroke();

    // 內部高光細節
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(b.x + 3, b.y + 3);
    this.ctx.lineTo(b.x + b.width - 3, b.y + 3);
    this.ctx.stroke();

    // 裝甲/強化磚塊裂紋顯示
    if (b.hitsRemaining < b.maxHits && b.maxHits > 1) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x + b.width * 0.3, b.y + 2);
      this.ctx.lineTo(b.x + b.width * 0.5, b.y + b.height * 0.6);
      this.ctx.lineTo(b.x + b.width * 0.8, b.y + b.height - 2);
      this.ctx.stroke();
    }

    // 炸彈磚塊圖標
    if (b.type === 'bomb') {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('💣', b.x + b.width / 2, b.y + b.height / 2);
    } else if (b.type === 'gold') {
      this.ctx.fillStyle = '#fef08a';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('★', b.x + b.width / 2, b.y + b.height / 2);
    }

    this.ctx.restore();
  }

  drawBall(ball) {
    this.ctx.save();

    // 待發射狀態時繪製瞄準軌跡導引線
    if (ball.stuck) {
      const angle = this.getLaunchAngle();
      const guideLen = 75;
      const targetX = ball.x + Math.sin(angle) * guideLen;
      const targetY = ball.y - Math.cos(angle) * guideLen;

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([5, 5]);
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.moveTo(ball.x, ball.y - ball.radius);
      this.ctx.lineTo(targetX, targetY);
      this.ctx.stroke();

      // 箭頭頂端光點
      this.ctx.fillStyle = '#7dd3fc';
      this.ctx.beginPath();
      this.ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (ball.fireball) {
      this.ctx.shadowColor = '#f97316';
      this.ctx.shadowBlur = 18;
      this.ctx.fillStyle = '#fb923c';
    } else {
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 12;
      this.ctx.fillStyle = '#ffffff';
    }

    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // 內核心
    this.ctx.fillStyle = ball.fireball ? '#ea580c' : '#0284c7';
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius * 0.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  drawPowerup(p) {
    this.ctx.save();
    this.ctx.shadowColor = p.color;
    this.ctx.shadowBlur = 10;

    // 圓角背景膠囊
    this.ctx.fillStyle = '#0f172a';
    this.ctx.strokeStyle = p.color;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.roundRect(p.x, p.y, p.width, p.height, 8);
    this.ctx.fill();
    this.ctx.stroke();

    // 圖標
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '13px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(p.icon, p.x + p.width / 2, p.y + p.height / 2);

    this.ctx.restore();
  }

  loop(currentTime) {
    const rawDt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // 限制最高 dt 避免因瀏覽器切換標籤導致穿牆
    const dt = Math.min(rawDt, 0.05);

    this.update(dt);
    this.render();

    this.animId = requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame((t) => this.loop(t));
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }
  }
}
