/**
 * 經典打磚塊遊戲 (Brick Breaker) - 核心遊戲邏輯與規則
 * 純 JavaScript 數學計算與狀態規則 (Decoupled Pure Logic)
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PADDLE_DEFAULT_WIDTH = 120;
export const PADDLE_EXPANDED_WIDTH = 180;
export const PADDLE_HEIGHT = 16;
export const PADDLE_SPEED = 650; // pixels per second for keyboard

export const BALL_RADIUS = 8;
export const BALL_INITIAL_SPEED = 420;
export const BALL_MAX_SPEED = 700;
export const BALL_SPEED_INCREMENT = 8; // Slight speedup per brick hit

export const BRICK_ROWS = 6;
export const BRICK_COLS = 10;
export const BRICK_GAP = 8;
export const BRICK_TOP_OFFSET = 70;
export const BRICK_LEFT_OFFSET = 35;
export const BRICK_WIDTH = Math.floor((CANVAS_WIDTH - (BRICK_LEFT_OFFSET * 2) - ((BRICK_COLS - 1) * BRICK_GAP)) / BRICK_COLS);
export const BRICK_HEIGHT = 24;

/**
 * 磚塊類型定義
 */
export const BRICK_TYPES = {
  NORMAL: { id: 'normal', hits: 1, score: 100, color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.6)' },
  REINFORCED: { id: 'reinforced', hits: 2, score: 200, color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },
  ARMORED: { id: 'armored', hits: 3, score: 350, color: '#ec4899', glow: 'rgba(236, 72, 153, 0.6)' },
  BOMB: { id: 'bomb', hits: 1, score: 250, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.8)' },
  GOLD: { id: 'gold', hits: Infinity, score: 50, color: '#eab308', glow: 'rgba(234, 179, 8, 0.8)' }
};

/**
 * 道具類型定義
 */
export const POWERUP_TYPES = {
  MULTIBALL: { id: 'multiball', name: '分身三球', icon: '⚡', color: '#38bdf8', duration: 0 },
  EXPAND: { id: 'expand', name: '加長球拍', icon: '↔️', color: '#4ade80', duration: 12 },
  LASER: { id: 'laser', name: '雷射巨砲', icon: '🔫', color: '#f43f5e', duration: 10 },
  FIREBALL: { id: 'fireball', name: '穿透火球', icon: '🔥', color: '#fb923c', duration: 8 },
  SLOW: { id: 'slow', name: '緩速時空', icon: '⏳', color: '#a855f7', duration: 10 },
  SHIELD: { id: 'shield', name: '護盾防線', icon: '🛡️', color: '#06b6d4', duration: 0 },
  LIFE: { id: 'life', name: '額外生命', icon: '❤️', color: '#f43f5e', duration: 0 }
};

/**
 * 關卡配置地圖
 * 0: 空白, 1: 一般, 2: 強化(2擊), 3: 裝甲(3擊), 4: 炸彈, 5: 金磚(不可摧毀)
 */
export const LEVELS = [
  {
    name: '第 1 關：彩虹初試',
    subtitle: '熟悉發球角度與連擊手感',
    layout: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0]
    ]
  },
  {
    name: '第 2 關：雙重防線',
    subtitle: '強化磚塊與炸彈初登場',
    layout: [
      [2, 2, 2, 2, 4, 4, 2, 2, 2, 2],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [2, 1, 2, 1, 2, 2, 1, 2, 1, 2],
      [1, 1, 1, 1, 4, 4, 1, 1, 1, 1],
      [1, 2, 1, 2, 1, 1, 2, 1, 2, 1]
    ]
  },
  {
    name: '第 3 關：太空入侵者',
    subtitle: '外星艦隊外型的挑戰陣列',
    layout: [
      [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 2, 2, 2, 2, 0, 0, 0],
      [0, 1, 2, 3, 2, 2, 3, 2, 1, 0],
      [1, 1, 4, 1, 4, 4, 1, 4, 1, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
      [0, 0, 1, 0, 0, 0, 0, 1, 0, 0]
    ]
  },
  {
    name: '第 4 關：黃金堡壘',
    subtitle: '善用炸彈連鎖引爆金屬障礙',
    layout: [
      [5, 3, 2, 1, 4, 4, 1, 2, 3, 5],
      [3, 5, 2, 1, 2, 2, 1, 2, 5, 3],
      [2, 2, 4, 3, 3, 3, 3, 4, 2, 2],
      [1, 1, 3, 5, 4, 4, 5, 3, 1, 1],
      [2, 3, 2, 1, 2, 2, 1, 2, 3, 2],
      [0, 1, 4, 1, 0, 0, 1, 4, 1, 0]
    ]
  },
  {
    name: '第 5 關：終極核心',
    subtitle: '高密度裝甲陣列與連鎖反應',
    layout: [
      [3, 3, 3, 4, 5, 5, 4, 3, 3, 3],
      [3, 2, 4, 2, 3, 3, 2, 4, 2, 3],
      [2, 4, 3, 4, 2, 2, 4, 3, 4, 2],
      [3, 2, 4, 2, 3, 3, 2, 4, 2, 3],
      [5, 3, 3, 4, 2, 2, 4, 3, 3, 5],
      [1, 2, 3, 4, 1, 1, 4, 3, 2, 1]
    ]
  }
];

export const RAINBOW_COLORS = [
  { color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.6)' },   // 烈焰紅
  { color: '#f97316', glow: 'rgba(249, 115, 22, 0.6)' },  // 活力橘
  { color: '#eab308', glow: 'rgba(234, 179, 8, 0.6)' },   // 璀璨黃
  { color: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' },  // 翡翠綠
  { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.6)' },   // 霓虹青
  { color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.6)' }   // 幻影紫
];

/**
 * 依據關卡索引產生磚塊陣列
 */
export function createBricksForLevel(levelIndex) {
  const levelData = LEVELS[levelIndex % LEVELS.length];
  const bricks = [];
  const layout = levelData.layout;

  for (let r = 0; r < layout.length; r++) {
    const rainbowTheme = RAINBOW_COLORS[r % RAINBOW_COLORS.length];
    for (let c = 0; c < layout[r].length; c++) {
      const typeCode = layout[r][c];
      if (typeCode === 0) continue;

      let typeDef = BRICK_TYPES.NORMAL;
      if (typeCode === 2) typeDef = BRICK_TYPES.REINFORCED;
      else if (typeCode === 3) typeDef = BRICK_TYPES.ARMORED;
      else if (typeCode === 4) typeDef = BRICK_TYPES.BOMB;
      else if (typeCode === 5) typeDef = BRICK_TYPES.GOLD;

      const x = BRICK_LEFT_OFFSET + c * (BRICK_WIDTH + BRICK_GAP);
      const y = BRICK_TOP_OFFSET + r * (BRICK_HEIGHT + BRICK_GAP);

      const color = typeCode === 1 ? rainbowTheme.color : typeDef.color;
      const glow = typeCode === 1 ? rainbowTheme.glow : typeDef.glow;

      bricks.push({
        id: `b_${r}_${c}`,
        row: r,
        col: c,
        x,
        y,
        width: BRICK_WIDTH,
        height: BRICK_HEIGHT,
        type: typeDef.id,
        hitsRemaining: typeDef.hits,
        maxHits: typeDef.hits,
        score: typeDef.score,
        color,
        glow,
        alive: true
      });
    }
  }

  return {
    name: levelData.name,
    subtitle: levelData.subtitle,
    bricks
  };
}

/**
 * 計算剩餘需要摧毀的磚塊數量 (排除 GOLD 不可摧毀之磚塊)
 */
export function getRemainingBreakableCount(bricks) {
  return bricks.filter(b => b.alive && b.type !== 'gold').length;
}

/**
 * 判斷球與球拍的碰撞
 * @param {Object} ball - {x, y, radius, vx, vy, speed}
 * @param {Object} paddle - {x, y, width, height}
 * @returns {boolean} 是否發生碰撞並完成反彈計算
 */
export function resolvePaddleBallCollision(ball, paddle) {
  // 只在球向下移動時檢查反彈
  if (ball.vy <= 0) return false;

  const closestX = Math.max(paddle.x, Math.min(ball.x, paddle.x + paddle.width));
  const closestY = Math.max(paddle.y, Math.min(ball.y, paddle.y + paddle.height));

  const distX = ball.x - closestX;
  const distY = ball.y - closestY;
  const distSq = distX * distX + distY * distY;

  if (distSq <= ball.radius * ball.radius) {
    // 碰撞發生！依據落點在球拍上的相對位置計算反彈角度
    // -1 (最左邊) ~ 0 (中間) ~ 1 (最右邊)
    const paddleCenter = paddle.x + paddle.width / 2;
    const hitOffset = (ball.x - paddleCenter) / (paddle.width / 2);
    const clampedOffset = Math.max(-0.95, Math.min(0.95, hitOffset));

    // 最大反彈偏角 65 度 (約 1.134 弧度)
    const maxBounceAngle = (65 * Math.PI) / 180;
    const bounceAngle = clampedOffset * maxBounceAngle;

    const currentSpeed = Math.min(
      BALL_MAX_SPEED,
      Math.hypot(ball.vx, ball.vy)
    );

    // 反彈向上
    ball.vx = currentSpeed * Math.sin(bounceAngle);
    ball.vy = -Math.abs(currentSpeed * Math.cos(bounceAngle));

    // 防止球嵌入球拍內部
    ball.y = paddle.y - ball.radius - 1;
    return true;
  }

  return false;
}

/**
 * 判斷球與磚塊的碰撞
 * @param {Object} ball - {x, y, radius, vx, vy}
 * @param {Object} brick - {x, y, width, height, alive}
 * @returns {null | {side: 'top'|'bottom'|'left'|'right'}}
 */
export function checkBallBrickCollision(ball, brick) {
  if (!brick.alive) return null;

  // 圓形與 AABB 矩形最近點碰撞偵測
  const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
  const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));

  const distX = ball.x - closestX;
  const distY = ball.y - closestY;
  const distSq = distX * distX + distY * distY;

  if (distSq > ball.radius * ball.radius) {
    return null;
  }

  // 計算碰撞發生在磚塊的哪一面
  const prevX = ball.x - ball.vx * 0.016;
  const prevY = ball.y - ball.vy * 0.016;

  const overlapLeft = (ball.x + ball.radius) - brick.x;
  const overlapRight = (brick.x + brick.width) - (ball.x - ball.radius);
  const overlapTop = (ball.y + ball.radius) - brick.y;
  const overlapBottom = (brick.y + brick.height) - (ball.y - ball.radius);

  const minOverlapX = Math.min(overlapLeft, overlapRight);
  const minOverlapY = Math.min(overlapTop, overlapBottom);

  let side = 'top';
  if (minOverlapX < minOverlapY) {
    side = distX > 0 ? 'right' : 'left';
  } else {
    side = distY > 0 ? 'bottom' : 'top';
  }

  return { side };
}

/**
 * 計算連擊加成得分
 * @param {number} baseScore 磚塊基礎分
 * @param {number} combo 目前連擊數 (>= 1)
 */
export function calculateComboScore(baseScore, combo) {
  const multiplier = Math.min(10, Math.max(1, combo));
  return baseScore * multiplier;
}

/**
 * 炸彈磚塊引爆時，找出受影響的相鄰磚塊列表
 * @param {Object} bombBrick
 * @param {Array} allBricks
 * @returns {Array} 被炸彈影響的磚塊
 */
export function getBombExplosionTargets(bombBrick, allBricks) {
  const explosionRadius = 110; // 爆炸半徑
  const targets = [];
  const bombCenterX = bombBrick.x + bombBrick.width / 2;
  const bombCenterY = bombBrick.y + bombBrick.height / 2;

  for (const b of allBricks) {
    if (!b.alive || b.id === bombBrick.id) continue;
    const bCenterX = b.x + b.width / 2;
    const bCenterY = b.y + b.height / 2;
    const dist = Math.hypot(bCenterX - bombCenterX, bCenterY - bombCenterY);

    if (dist <= explosionRadius) {
      targets.push(b);
    }
  }

  return targets;
}
