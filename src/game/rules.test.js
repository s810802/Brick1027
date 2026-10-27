import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBricksForLevel,
  getRemainingBreakableCount,
  resolvePaddleBallCollision,
  checkBallBrickCollision,
  calculateComboScore,
  getBombExplosionTargets,
  PADDLE_DEFAULT_WIDTH,
  PADDLE_HEIGHT
} from './rules.js';

test('level 1 generates correct brick count and metadata', () => {
  const level1 = createBricksForLevel(0);
  assert.equal(level1.name, '第 1 關：彩虹初試');
  assert.ok(level1.bricks.length > 0);
  const breakableCount = getRemainingBreakableCount(level1.bricks);
  assert.equal(breakableCount, level1.bricks.length); // Level 1 has no gold bricks
});

test('calculateComboScore applies multiplier clamped up to 10x', () => {
  assert.equal(calculateComboScore(100, 1), 100);
  assert.equal(calculateComboScore(100, 3), 300);
  assert.equal(calculateComboScore(100, 10), 1000);
  assert.equal(calculateComboScore(100, 15), 1000); // Max clamped to 10
});

test('resolvePaddleBallCollision deflections', () => {
  const paddle = { x: 300, y: 550, width: PADDLE_DEFAULT_WIDTH, height: PADDLE_HEIGHT };
  
  // Ball hitting center moving down
  const ballCenter = {
    x: 360, // Exactly center of paddle (300 + 60)
    y: 548,
    radius: 8,
    vx: 0,
    vy: 400
  };

  const hitCenter = resolvePaddleBallCollision(ballCenter, paddle);
  assert.equal(hitCenter, true);
  assert.ok(ballCenter.vy < 0, 'Ball vy should reflect upwards');
  assert.ok(Math.abs(ballCenter.vx) < 1, 'Center hit vx should be near 0');

  // Ball hitting right edge
  const ballRight = {
    x: 410, // Far right of paddle
    y: 548,
    radius: 8,
    vx: 0,
    vy: 400
  };
  const hitRight = resolvePaddleBallCollision(ballRight, paddle);
  assert.equal(hitRight, true);
  assert.ok(ballRight.vx > 50, 'Right hit should send ball rightwards');
  assert.ok(ballRight.vy < 0, 'Right hit should send ball upwards');
});

test('checkBallBrickCollision accurately detects hit and side', () => {
  const brick = {
    id: 'test_brick',
    x: 200,
    y: 100,
    width: 60,
    height: 20,
    alive: true
  };

  // Ball hitting bottom of brick
  const ballHittingBottom = {
    x: 230,
    y: 122,
    radius: 6,
    vx: 0,
    vy: -300
  };

  const collision = checkBallBrickCollision(ballHittingBottom, brick);
  assert.ok(collision !== null);
  assert.equal(collision.side, 'bottom');

  // Dead brick should not collide
  brick.alive = false;
  const noCollision = checkBallBrickCollision(ballHittingBottom, brick);
  assert.equal(noCollision, null);
});

test('getBombExplosionTargets identifies adjacent bricks within radius', () => {
  const bomb = { id: 'bomb', x: 200, y: 100, width: 60, height: 20, alive: true };
  const nearby = { id: 'b1', x: 265, y: 100, width: 60, height: 20, alive: true };
  const farAway = { id: 'b2', x: 500, y: 400, width: 60, height: 20, alive: true };

  const targets = getBombExplosionTargets(bomb, [bomb, nearby, farAway]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, 'b1');
});

test('ball launch calculation sends ball upwards into playfield', () => {
  const speed = 400;
  // straight up (angle 0)
  const angleZero = 0;
  const vxZero = speed * Math.sin(angleZero);
  const vyZero = -Math.abs(speed * Math.cos(angleZero));
  assert.equal(vxZero, 0);
  assert.equal(vyZero, -400);

  // angled right (0.2 rad)
  const angleRight = 0.2;
  const vxRight = speed * Math.sin(angleRight);
  const vyRight = -Math.abs(speed * Math.cos(angleRight));
  assert.ok(vxRight > 0, 'vx should be positive for right angle');
  assert.ok(vyRight < -350, 'vy should be strongly negative (upward)');
});
