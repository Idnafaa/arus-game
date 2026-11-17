// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Flat shapes and canvas text for the HUD and the
// panels. Text that holds a number is rebuilt only when the number changes, so
// a frame allocates nothing.
import { FIELD, FONT, GOAL_DELIVERIES, LIVES, PALETTE, POPUP_SECONDS, RIVER } from './config.js';
import { KIND_GOLD, KIND_HEART, KIND_LOG, KIND_PARCEL, KIND_ROCK, KIND_SHIELD, KIND_WHIRLPOOL } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function cachedPair(prefix, suffix) {
  let a = -1;
  let b = -1;
  let text = '';
  return function label(nextA, nextB) {
    if (nextA !== a || nextB !== b) {
      a = nextA;
      b = nextB;
      text = prefix + nextA + suffix + nextB;
    }
    return text;
  };
}

/** Fixed trees and houses along each bank, so the banks read the same every frame. */
const BANK_SPOTS = [];
for (let index = 0; index < 9; index += 1) {
  BANK_SPOTS.push({ y: 40 + index * 78, tree: index % 3 !== 2, house: index % 3 === 2 });
}

/** Reeds at the water's edge and flowers on the banks, fixed per bank. */
const BANK_PLANTS = [];
for (let index = 0; index < 12; index += 1) {
  BANK_PLANTS.push({ y: 30 + index * 58, reed: index % 2 === 0 });
}

/** Leaves drifting downstream: their places come from the world's flow clock, so they never jump. */
const LEAVES = [];
for (let index = 0; index < 7; index += 1) {
  LEAVES.push({ x: RIVER.left + 60 + index * 127, phase: index * 97 });
}

/** Burst particles live here, not in the world: they are garnish, not rules. */
const PARTICLES = [];
for (let index = 0; index < 64; index += 1) {
  PARTICLES.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max: 1, color: '#ffffff', size: 3 });
}

/** The river's time of day by level: morning, midday, then dusk as the run deepens. */
function timeOfDay(level) {
  return level >= 7 ? 'Dusk' : level >= 4 ? 'Midday' : 'Morning';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let shake = 0;
  let bannerText = '';
  let bannerUntil = 0;
  let lastNow = 0;
  const scoreLabel = cachedLabel('Score ');
  const levelLabel = cachedLabel('Level ');
  const comboLabel = cachedLabel('Combo x');
  const deliveredLabel = cachedPair('Delivered ', '/');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');

  /** A burst of sparks at (x, y); called on pickups, hits and shield breaks. */
  function burst(x, y, color, count = 14) {
    let made = 0;
    for (let index = 0; index < PARTICLES.length && made < count; index += 1) {
      const particle = PARTICLES[index];
      if (particle.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed - 40;
      particle.ttl = 0.45 + Math.random() * 0.3;
      particle.max = particle.ttl;
      particle.color = color;
      particle.size = 2 + Math.random() * 3;
      made += 1;
    }
  }

  function updateParticles(dt) {
    for (let index = 0; index < PARTICLES.length; index += 1) {
      const particle = PARTICLES[index];
      if (!particle.active) continue;
      particle.ttl -= dt;
      if (particle.ttl <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 260 * dt;
    }
  }

  function drawParticles() {
    for (let index = 0; index < PARTICLES.length; index += 1) {
      const particle = PARTICLES[index];
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.ttl / particle.max);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawBanks() {
    context.fillStyle = PALETTE.bank;
    context.fillRect(0, 0, RIVER.left, FIELD.height);
    context.fillRect(RIVER.right, 0, FIELD.width - RIVER.right, FIELD.height);
    context.fillStyle = PALETTE.bankEdge;
    context.fillRect(RIVER.left - 10, 0, 10, FIELD.height);
    context.fillRect(RIVER.right, 0, 10, FIELD.height);
    for (let index = 0; index < BANK_SPOTS.length; index += 1) {
      const spot = BANK_SPOTS[index];
      const leftX = 90;
      const rightX = FIELD.width - 90;
      for (const x of [leftX, rightX]) {
        if (spot.house) {
          context.fillStyle = PALETTE.house;
          context.fillRect(x - 34, spot.y, 68, 44);
          context.fillStyle = PALETTE.roof;
          context.beginPath();
          context.moveTo(x - 40, spot.y);
          context.lineTo(x, spot.y - 26);
          context.lineTo(x + 40, spot.y);
          context.closePath();
          context.fill();
        } else {
          context.fillStyle = PALETTE.log;
          context.fillRect(x - 4, spot.y + 10, 8, 26);
          context.fillStyle = index % 2 === 0 ? PALETTE.tree : PALETTE.treeDark;
          context.beginPath();
          context.arc(x, spot.y, 26, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    // Reeds at the water's edge and flowers on the banks.
    for (let index = 0; index < BANK_PLANTS.length; index += 1) {
      const plant = BANK_PLANTS[index];
      if (plant.reed) {
        context.strokeStyle = PALETTE.reed;
        context.lineWidth = 3;
        for (const x of [RIVER.left - 14, RIVER.right + 14]) {
          context.beginPath();
          context.moveTo(x, plant.y + 18);
          context.quadraticCurveTo(x + 5, plant.y, x + 2, plant.y - 14);
          context.stroke();
        }
      } else {
        context.fillStyle = index % 4 === 1 ? PALETTE.heart : PALETTE.gold;
        for (const x of [52, FIELD.width - 52]) {
          context.beginPath();
          context.arc(x, plant.y, 4, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  function drawRiver(state) {
    context.fillStyle = PALETTE.river;
    context.fillRect(RIVER.left, 0, RIVER.right - RIVER.left, FIELD.height);
    context.fillStyle = PALETTE.riverDeep;
    context.fillRect(RIVER.left, 0, 26, FIELD.height);
    context.fillRect(RIVER.right - 26, 0, 26, FIELD.height);
    // Foam streaks drifting downstream: their offset is the world's flow clock.
    context.strokeStyle = PALETTE.foam;
    context.globalAlpha = 0.35;
    context.lineWidth = 3;
    for (let lane = 0; lane < 5; lane += 1) {
      const x = RIVER.left + 90 + lane * 180;
      const offset = (state.flow * 90 + lane * 130) % 180;
      for (let y = -180 + offset; y < FIELD.height; y += 180) {
        context.beginPath();
        context.moveTo(x, y);
        context.quadraticCurveTo(x + 18, y + 22, x, y + 44);
        context.stroke();
      }
    }
    // Leaves drifting downstream with the current.
    context.fillStyle = PALETTE.leaf;
    for (let index = 0; index < LEAVES.length; index += 1) {
      const leaf = LEAVES[index];
      const y = (state.flow * 70 + leaf.phase * 13) % (FIELD.height + 40) - 20;
      context.beginPath();
      context.ellipse(leaf.x, y, 9, 4, Math.sin(state.flow + leaf.phase) * 0.6, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawParcel(item) {
    context.fillStyle = PALETTE.parcel;
    context.fillRect(item.x, item.y, item.width, item.height);
    context.fillStyle = PALETTE.parcelRibbon;
    context.fillRect(item.x + item.width / 2 - 3, item.y, 6, item.height);
    context.fillRect(item.x, item.y + item.height / 2 - 3, item.width, 6);
  }

  function drawGold(item) {
    context.fillStyle = PALETTE.gold;
    context.fillRect(item.x, item.y, item.width, item.height);
    context.fillStyle = PALETTE.boat;
    context.font = `20px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('★', item.x + item.width / 2, item.y + item.height / 2 + 7);
  }

  function drawHeart(item) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    context.fillStyle = PALETTE.heart;
    context.beginPath();
    context.arc(cx - 6, cy - 4, 7, 0, Math.PI * 2);
    context.arc(cx + 6, cy - 4, 7, 0, Math.PI * 2);
    context.moveTo(cx - 12, cy - 2);
    context.lineTo(cx, cy + 12);
    context.lineTo(cx + 12, cy - 2);
    context.closePath();
    context.fill();
  }

  function drawLog(item) {
    context.fillStyle = PALETTE.log;
    context.fillRect(item.x, item.y, item.width, item.height);
    context.fillStyle = PALETTE.logEnd;
    context.beginPath();
    context.arc(item.x + 8, item.y + item.height / 2, 9, 0, Math.PI * 2);
    context.arc(item.x + item.width - 8, item.y + item.height / 2, 9, 0, Math.PI * 2);
    context.fill();
  }

  function drawRock(item) {
    context.fillStyle = PALETTE.rock;
    context.beginPath();
    context.moveTo(item.x + 4, item.y + item.height);
    context.lineTo(item.x + 8, item.y + 8);
    context.lineTo(item.x + item.width / 2, item.y);
    context.lineTo(item.x + item.width - 6, item.y + 10);
    context.lineTo(item.x + item.width - 2, item.y + item.height);
    context.closePath();
    context.fill();
  }

  function drawWhirlpool(item, state) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const spin = state.flow * 2.4;
    context.fillStyle = PALETTE.whirlpoolDeep;
    context.beginPath();
    context.arc(cx, cy, item.width / 2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.whirlpool;
    context.lineWidth = 4;
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = item.width / 2 - 6 - ring * 8;
      if (radius <= 2) continue;
      context.beginPath();
      context.arc(cx, cy, radius, spin + ring * 1.1, spin + ring * 1.1 + Math.PI * 1.4);
      context.stroke();
    }
    context.fillStyle = PALETTE.whirlpool;
    context.beginPath();
    context.arc(cx, cy, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawShield(item) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    context.strokeStyle = PALETTE.shieldRing;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, 13, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.shield;
    context.beginPath();
    context.moveTo(cx, cy - 9);
    context.lineTo(cx + 8, cy - 4);
    context.lineTo(cx + 6, cy + 7);
    context.lineTo(cx, cy + 10);
    context.lineTo(cx - 6, cy + 7);
    context.lineTo(cx - 8, cy - 4);
    context.closePath();
    context.fill();
  }

  function drawBoat(state) {
    const boat = state.boat;
    // Blink while invulnerable after a hit: hidden on every other tenth of a second.
    if (boat.invulnerable !== 0 && Math.floor(boat.invulnerable * 10) % 2 === 0) return;
    const cx = boat.x + boat.width / 2;
    const top = boat.y;
    // Wake foam behind the boat.
    context.fillStyle = PALETTE.foam;
    context.globalAlpha = 0.5;
    context.beginPath();
    context.ellipse(cx, top + boat.height + 12, 34, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    // Hull: a wooden perahu, pointed at the bow.
    context.fillStyle = PALETTE.boat;
    context.beginPath();
    context.moveTo(boat.x + 4, top + 12);
    context.lineTo(boat.x + 14, top + boat.height);
    context.lineTo(boat.x + boat.width - 14, top + boat.height);
    context.lineTo(boat.x + boat.width - 4, top + 12);
    context.lineTo(cx + 26, top + 4);
    context.lineTo(cx - 26, top + 4);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.boatTrim;
    context.fillRect(boat.x + 10, top + 10, boat.width - 20, 4);
    // Cargo: a parcel box for each delivery so far (up to five), stacked on deck.
    const cargo = Math.min(state.delivered, 5);
    for (let index = 0; index < cargo; index += 1) {
      context.fillStyle = index % 2 === 0 ? PALETTE.parcel : PALETTE.gold;
      context.fillRect(boat.x + 16 + index * 11, top + 12, 9, 8);
    }
    // A shield the boat carries rings it in pale blue.
    if (state.shield) {
      context.strokeStyle = PALETTE.shieldRing;
      context.globalAlpha = 0.65 + 0.35 * Math.sin(state.flow * 6);
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(cx, top + boat.height / 2, boat.width / 2 + 8, boat.height / 2 + 12, 0, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    // The courier: hat and shoulders above the hull.
    context.fillStyle = PALETTE.courier;
    context.beginPath();
    context.arc(cx, top + 2, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(cx - 14, top - 2);
    context.lineTo(cx, top - 14);
    context.lineTo(cx + 14, top - 2);
    context.closePath();
    context.fill();
  }

  function drawField(state) {
    drawRiver(state);
    drawBanks();
    for (let index = 0; index < state.items.length; index += 1) {
      const item = state.items[index];
      if (!item.active) continue;
      if (item.kind === KIND_PARCEL) drawParcel(item);
      else if (item.kind === KIND_GOLD) drawGold(item);
      else if (item.kind === KIND_HEART) drawHeart(item);
      else if (item.kind === KIND_LOG) drawLog(item);
      else if (item.kind === KIND_ROCK) drawRock(item);
      else if (item.kind === KIND_WHIRLPOOL) drawWhirlpool(item, state);
      else if (item.kind === KIND_SHIELD) drawShield(item);
    }
    drawBoat(state);
    drawParticles();
    // Floating score notes, rising and fading.
    context.textBaseline = 'alphabetic';
    for (let index = 0; index < state.popups.length; index += 1) {
      const popup = state.popups[index];
      if (!popup.active) continue;
      const age = 1 - popup.ttl / POPUP_SECONDS;
      context.globalAlpha = Math.max(0, popup.ttl / POPUP_SECONDS);
      text(popup.text, popup.x, popup.y - age * 34, 22, PALETTE.spark, 'center');
    }
    context.globalAlpha = 1;
    // The day deepens as the levels climb: a warm morning, then dusk.
    if (state.level >= 7) {
      context.fillStyle = 'rgba(64, 48, 120, 0.16)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    } else if (state.level <= 3) {
      context.fillStyle = 'rgba(255, 214, 140, 0.07)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state) {
    context.fillStyle = 'rgba(11, 30, 38, 0.72)';
    context.fillRect(0, 0, FIELD.width, 56);
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 14, 28, PALETTE.text, 'left');
    text(deliveredLabel(state.delivered, GOAL_DELIVERIES), 300, 14, 28, PALETTE.text, 'left');
    text(comboLabel(state.combo), 560, 14, 28, state.combo > 1 ? PALETTE.gold : PALETTE.muted, 'left');
    // The combo meter: how far the streak is to the next multiplier.
    if (state.streak > 0 && state.combo < 5) {
      const fraction = (state.streak % 4) / 4;
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(560, 46, 110, 6);
      context.fillStyle = PALETTE.gold;
      context.fillRect(560, 46, 110 * fraction, 6);
    }
    // The route's progress: a thin gold bar under the HUD.
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(0, 56, FIELD.width, 5);
    context.fillStyle = PALETTE.gold;
    context.fillRect(0, 56, FIELD.width * Math.min(1, state.delivered / GOAL_DELIVERIES), 5);
    text(levelLabel(state.level), FIELD.width / 2 + 120, 14, 28, PALETTE.text, 'center');
    text(timeOfDay(state.level), FIELD.width / 2 + 220, 20, 20, PALETTE.muted, 'center');
    text('Lives', FIELD.width - 24 - LIVES * 28, 14, 28, PALETTE.text, 'right');
    for (let life = 0; life < LIVES; life += 1) {
      const x = FIELD.width - 24 - (LIVES - life) * 28;
      context.fillStyle = life < state.lives ? PALETTE.heart : 'rgba(255,255,255,0.18)';
      context.beginPath();
      context.arc(x + 6, 26, 7, 0, Math.PI * 2);
      context.arc(x + 18, 26, 7, 0, Math.PI * 2);
      context.moveTo(x, 28);
      context.lineTo(x + 12, 42);
      context.lineTo(x + 24, 28);
      context.closePath();
      context.fill();
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.boatTrim;
    context.lineWidth = 3;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.gold, 'center');
  }

  const TITLE_LINES = [
    'River Courier — deliver 25 parcels down the river.',
    'Catch parcels and golden crates. Dodge logs, rocks and whirlpools.',
    'Grab shields, chain combos, and slip past hazards for close-call bonuses.',
    'Steer with ← → or A D, or the mouse. Pause with P.',
    '',
  ];
  const PAUSED_LINES = ['The river will wait for you.'];
  const OVER_LINES = ['', '', ''];
  const WIN_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    const now = performance.now();
    const dt = lastNow === 0 ? 0 : Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    updateParticles(dt);
    if (shake > 0.4) shake *= 0.88;
    else shake = 0;
    const shakeX = shake === 0 ? 0 : (Math.random() * 2 - 1) * shake;
    const shakeY = shake === 0 ? 0 : (Math.random() * 2 - 1) * shake;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('ARUS', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    // A level-up banner, fading after a couple of seconds.
    if (bannerText !== '' && now < bannerUntil) {
      context.globalAlpha = Math.min(1, (bannerUntil - now) / 500);
      text(bannerText, FIELD.width / 2, 108, 30, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = deliveredLabel(state.delivered, GOAL_DELIVERIES);
      OVER_LINES[2] = bestLabel(best);
      drawPanel('River wins this time', OVER_LINES, 'Press Space or click to play again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = deliveredLabel(state.delivered, GOAL_DELIVERIES);
      WIN_LINES[2] = bestLabel(best);
      drawPanel('Route complete!', WIN_LINES, 'Press Space or click to sail again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Show a banner line over the river for about two seconds. */
    banner(message) {
      bannerText = message;
      bannerUntil = performance.now() + 2200;
    },
    /** Jolt the view; a hit shakes harder than a shield break. */
    shake(amount) {
      shake = Math.max(shake, amount);
    },
    burst,
  };
}
