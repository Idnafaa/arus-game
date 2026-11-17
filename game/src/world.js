// The game's rules and state, with no drawing and no browser in it: the courier
// boat, the pool of things floating down the river, spawning, collisions, the
// delivery goal, the combo, score, lives and level. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. Nothing here allocates after
// createWorld returns.

import {
  BOAT, COMBO_MAX, COMBO_PER_STREAK, FIELD, GOAL_DELIVERIES, GOLD, HEART,
  LEVEL, LIVES, LOG, PARCEL, POOL_SIZE, RIVER, ROCK,
} from './config.js';

export const KIND_PARCEL = 0;
export const KIND_LOG = 1;
export const KIND_ROCK = 2;
export const KIND_GOLD = 3;
export const KIND_HEART = 4;

export const EVENT_PARCEL = 1;
export const EVENT_GOLD = 2;
export const EVENT_HEART = 4;
export const EVENT_HIT = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function isHazard(kind) {
  return kind === KIND_LOG || kind === KIND_ROCK;
}

export function createWorld(random) {
  const boat = {
    x: 0, y: BOAT.y, width: BOAT.width, height: BOAT.height, invulnerable: 0,
  };
  const items = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    items.push({ active: false, kind: KIND_PARCEL, x: 0, y: 0, width: 0, height: 0, speed: 0, spin: 0 });
  }
  const state = {
    boat, items, score: 0, lives: LIVES, level: 1, elapsed: 0,
    delivered: 0, streak: 0, combo: 1,
    logTimer: 0, rockTimer: 0, parcelTimer: 0, goldTimer: 0, heartTimer: 0,
    flow: 0,
  };

  function reset() {
    boat.x = (FIELD.width - boat.width) / 2;
    boat.invulnerable = 0;
    for (const item of items) item.active = false;
    state.score = 0;
    state.lives = LIVES;
    state.level = 1;
    state.elapsed = 0;
    state.delivered = 0;
    state.streak = 0;
    state.combo = 1;
    state.logTimer = LOG.interval;
    state.rockTimer = ROCK.interval;
    state.parcelTimer = PARCEL.interval;
    state.goldTimer = GOLD.interval;
    state.heartTimer = HEART.interval;
    state.flow = 0;
  }

  function freeItem() {
    for (let index = 0; index < items.length; index += 1) {
      if (!items[index].active) return items[index];
    }
    return null;
  }

  function riverX(width) {
    return RIVER.left + 8 + random() * (RIVER.right - RIVER.left - 16 - width);
  }

  function spawn(kind, width, height, speed) {
    const item = freeItem();
    if (item === null) return;
    item.active = true;
    item.kind = kind;
    item.width = width;
    item.height = height;
    item.x = riverX(width);
    item.y = -height - random() * 40;
    item.speed = speed;
    item.spin = random() * Math.PI * 2;
  }

  function spawnLog() {
    const width = LOG.minWidth + random() * (LOG.maxWidth - LOG.minWidth);
    spawn(KIND_LOG, width, LOG.height, LOG.speed + LOG.speedPerLevel * (state.level - 1));
  }

  function spawnRock() {
    spawn(KIND_ROCK, ROCK.size, ROCK.size, ROCK.speed + ROCK.speedPerLevel * (state.level - 1));
  }

  function spawnParcel() {
    spawn(KIND_PARCEL, PARCEL.width, PARCEL.height, PARCEL.speed + PARCEL.speedPerLevel * (state.level - 1));
  }

  function spawnGold() {
    spawn(KIND_GOLD, GOLD.size, GOLD.size, GOLD.speed);
  }

  function spawnHeart() {
    spawn(KIND_HEART, HEART.width, HEART.height, HEART.speed);
  }

  function logInterval() {
    return Math.max(LOG.minInterval, LOG.interval * LOG.intervalScale ** (state.level - 1));
  }

  function refreshCombo() {
    state.combo = Math.min(COMBO_MAX, 1 + Math.floor(state.streak / COMBO_PER_STREAK));
  }

  /**
   * One fixed step. `direction` is -1, 0 or 1 (left, still, right). With
   * `harmless` set (the title screen's backdrop) things float but nothing
   * touches the boat and nothing scores.
   */
  function step(dt, direction, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.flow += dt;
    state.level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));

    boat.x = Math.min(
      RIVER.right - boat.width,
      Math.max(RIVER.left, boat.x + direction * BOAT.speed * dt),
    );
    if (boat.invulnerable > 0) boat.invulnerable = Math.max(0, boat.invulnerable - dt);

    state.logTimer -= dt;
    if (state.logTimer <= 0) {
      spawnLog();
      state.logTimer += logInterval();
    }
    state.rockTimer -= dt;
    if (state.rockTimer <= 0) {
      spawnRock();
      state.rockTimer += ROCK.interval;
    }
    state.parcelTimer -= dt;
    if (state.parcelTimer <= 0) {
      spawnParcel();
      state.parcelTimer += PARCEL.interval + random() * PARCEL.intervalJitter;
    }
    state.goldTimer -= dt;
    if (state.goldTimer <= 0) {
      spawnGold();
      state.goldTimer += GOLD.interval;
    }
    state.heartTimer -= dt;
    if (state.heartTimer <= 0) {
      spawnHeart();
      state.heartTimer += HEART.interval;
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      item.y += item.speed * dt;
      if (item.y > FIELD.height + 40) {
        item.active = false;
        continue;
      }
      if (harmless || !overlaps(item, boat)) continue;
      if (item.kind === KIND_PARCEL) {
        item.active = false;
        state.streak += 1;
        refreshCombo();
        state.score += PARCEL.points * state.combo;
        state.delivered += 1;
        events |= EVENT_PARCEL;
      } else if (item.kind === KIND_GOLD) {
        item.active = false;
        state.streak += 1;
        refreshCombo();
        state.score += GOLD.points * state.combo;
        state.delivered += GOLD.deliveries;
        events |= EVENT_GOLD;
      } else if (item.kind === KIND_HEART) {
        item.active = false;
        if (state.lives < LIVES) state.lives += 1;
        events |= EVENT_HEART;
      } else if (boat.invulnerable === 0) {
        item.active = false;
        state.lives -= 1;
        state.streak = 0;
        refreshCombo();
        boat.invulnerable = BOAT.invulnerable;
        events |= EVENT_HIT;
        if (state.lives === 0) {
          events |= EVENT_OVER;
          break;
        }
      }
      if (state.delivered >= GOAL_DELIVERIES) {
        events |= EVENT_WIN;
        break;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, isHazard };
}
