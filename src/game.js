/**
 * 經典打磚塊 (Brick Breaker) - 前端 DOM 控制器與事件綁定
 * 純 JavaScript，無任何 React 或 TypeScript 依賴
 */

import { BrickBreakerEngine } from './game/engine.js';
import { sounds } from './game/audio.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const titleScreen = document.getElementById('title-screen');
  const pauseModal = document.getElementById('pause-modal');
  const gameoverModal = document.getElementById('gameover-modal');
  const victoryModal = document.getElementById('victory-modal');

  // HUD 節點
  const hudScore = document.getElementById('hud-score');
  const hudHighScore = document.getElementById('hud-high-score');
  const hudLevel = document.getElementById('hud-level');
  const hudLives = document.getElementById('hud-lives');
  const hudCombo = document.getElementById('hud-combo');
  const hudPowerups = document.getElementById('hud-powerups');
  const btnSound = document.getElementById('btn-sound');
  const soundIconOn = document.getElementById('sound-icon-on');
  const soundIconOff = document.getElementById('sound-icon-off');

  // 結算數據節點
  const goScore = document.getElementById('go-score');
  const goMaxCombo = document.getElementById('go-max-combo');
  const goBricks = document.getElementById('go-bricks');
  const vicScore = document.getElementById('vic-score');
  const vicMaxCombo = document.getElementById('vic-max-combo');
  const vicBricks = document.getElementById('vic-bricks');

  // 初始化音效靜音圖示
  const updateSoundUI = (isMuted) => {
    if (isMuted) {
      soundIconOn.classList.add('hidden');
      soundIconOff.classList.remove('hidden');
      btnSound.setAttribute('aria-label', '開啟音效 (M)');
    } else {
      soundIconOn.classList.remove('hidden');
      soundIconOff.classList.add('hidden');
      btnSound.setAttribute('aria-label', '靜音 (M)');
    }
  };
  updateSoundUI(sounds.getMuted());

  // 建立遊戲引擎實例
  const engine = new BrickBreakerEngine(canvas, {
    onStateChange: (state, runStats) => {
      // 依據狀態切換覆蓋層顯示
      titleScreen.classList.toggle('hidden', state !== 'title');
      pauseModal.classList.toggle('hidden', state !== 'paused');
      gameoverModal.classList.toggle('hidden', state !== 'gameover');
      victoryModal.classList.toggle('hidden', state !== 'victory');

      if (state === 'gameover' && runStats) {
        goScore.textContent = runStats.score.toLocaleString();
        goMaxCombo.textContent = `${runStats.maxCombo}x`;
        goBricks.textContent = String(runStats.destroyed);
      } else if (state === 'victory' && runStats) {
        vicScore.textContent = runStats.score.toLocaleString();
        vicMaxCombo.textContent = `${runStats.maxCombo}x`;
        vicBricks.textContent = String(runStats.destroyed);
      }
    },

    onStatsUpdate: (stats) => {
      hudScore.textContent = stats.score.toLocaleString();
      hudHighScore.textContent = `最高: ${stats.highScore.toLocaleString()}`;
      hudLevel.textContent = `第 ${stats.levelIndex} 關`;

      // 渲染生命愛心
      let heartsHtml = '';
      for (let i = 0; i < stats.maxLives; i++) {
        if (i < stats.lives) {
          heartsHtml += `<span class="inline-block text-rose-500 animate-pulse text-lg drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]">❤️</span>`;
        } else {
          heartsHtml += `<span class="inline-block text-slate-700 text-lg opacity-40">🖤</span>`;
        }
      }
      hudLives.innerHTML = heartsHtml;

      // 連擊顯示
      if (stats.combo > 1) {
        hudCombo.classList.remove('opacity-0', 'scale-90');
        hudCombo.classList.add('opacity-100', 'scale-100');
        hudCombo.innerHTML = `連擊 <span class="text-amber-400 font-extrabold text-lg">${stats.combo}x</span>`;
      } else {
        hudCombo.classList.remove('opacity-100', 'scale-100');
        hudCombo.classList.add('opacity-0', 'scale-90');
      }

      // 渲染啟動中的道具列表
      let pUpsHtml = '';
      const p = stats.activePowerups;
      if (p.expand > 0) {
        pUpsHtml += `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs shadow-[0_0_10px_rgba(16,185,129,0.3)]"><span>↔️</span><span>加長 ${Math.ceil(p.expand)}s</span></div>`;
      }
      if (p.laser > 0) {
        pUpsHtml += `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs shadow-[0_0_10px_rgba(244,63,94,0.3)]"><span>🔫</span><span>雷射 ${Math.ceil(p.laser)}s</span></div>`;
      }
      if (p.fireball > 0) {
        pUpsHtml += `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-950/80 border border-orange-500/50 text-orange-300 text-xs shadow-[0_0_10px_rgba(249,115,22,0.3)]"><span>🔥</span><span>貫穿 ${Math.ceil(p.fireball)}s</span></div>`;
      }
      if (p.slow > 0) {
        pUpsHtml += `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-950/80 border border-purple-500/50 text-purple-300 text-xs shadow-[0_0_10px_rgba(168,85,247,0.3)]"><span>⏳</span><span>緩速 ${Math.ceil(p.slow)}s</span></div>`;
      }
      if (p.shield) {
        pUpsHtml += `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)]"><span>🛡️</span><span>防護盾</span></div>`;
      }
      hudPowerups.innerHTML = pUpsHtml;
    },

    onMuteToggle: (isMuted) => {
      updateSoundUI(isMuted);
    }
  });

  // 按鈕點擊綁定
  document.getElementById('btn-start').addEventListener('click', () => {
    engine.startGame();
  });

  document.getElementById('btn-sound').addEventListener('click', (e) => {
    e.currentTarget.blur();
    const muted = sounds.toggleMute();
    updateSoundUI(muted);
  });

  document.getElementById('btn-pause').addEventListener('click', (e) => {
    e.currentTarget.blur();
    engine.pauseGame();
  });

  document.getElementById('btn-restart').addEventListener('click', (e) => {
    e.currentTarget.blur();
    engine.restartGame();
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    engine.resumeGame();
  });

  document.getElementById('btn-pause-restart').addEventListener('click', () => {
    engine.restartGame();
  });

  document.getElementById('btn-pause-title').addEventListener('click', () => {
    engine.state = 'title';
    document.body.dataset.state = 'title';
    titleScreen.classList.remove('hidden');
    pauseModal.classList.add('hidden');
  });

  document.getElementById('btn-retry').addEventListener('click', () => {
    engine.startGame();
  });

  document.getElementById('btn-gameover-title').addEventListener('click', () => {
    engine.state = 'title';
    document.body.dataset.state = 'title';
    titleScreen.classList.remove('hidden');
    gameoverModal.classList.add('hidden');
  });

  document.getElementById('btn-victory-retry').addEventListener('click', () => {
    engine.startGame();
  });

  document.getElementById('btn-victory-title').addEventListener('click', () => {
    engine.state = 'title';
    document.body.dataset.state = 'title';
    titleScreen.classList.remove('hidden');
    victoryModal.classList.add('hidden');
  });

  // 支援 ?autostart=1 參數直接開始遊戲
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autostart') === '1') {
    engine.startGame();
  }

  // 啟動繪製更新迴圈
  engine.start();
});
