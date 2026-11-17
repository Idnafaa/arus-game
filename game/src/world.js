// The game's rules and state, with no drawing and no browser in it: the courier
// boat, the pool of things floating down the river, spawning, collisions, the
// delivery goal, the combo, score, lives and level. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. Nothing here allocates after
// createWorld returns.

import {
  BOAT, COMBO_MAX, COMBO_PER_STREAK, FIELD, GOAL_DELIVERIES, GOLD, HEART,
  LEVEL, LIVES, LOG, NEAR_MISS, PARCEL, POOL_SIZE, POPUP_POOL, POPUP_SECONDS,
  RIVER, ROCK, SHIELD, WHIRLPOOL,
} from './config.js';

export const KIND_PARCEL = 0;
export const KIND_LOG = 1;
export const KIND_ROCK = 2;
export const KIND_GOLD = 3;
export const KIND_HEART = 4;
export const KIND_WHIRLPOOL = 5;
export const KIND_SHIELD = 6;

export const EVENT_PARCEL = 1;
export const EVENT_GOLD = 2;
export const EVENT_HEART = 4;
export const EVENT_HIT = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_NEAR = 64;
export const EVENT_LEVELUP = 128;
export const EVENT_SHIELD = 256;
export const EVENT_SHIELD_BLOCK = 512;

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function isHazard(kind) {
  return kind === KIND_LOG || kind === KIND_ROCK || kind === KIND_WHIRLPOOL;
}

export function createWorld(random) {
  const boat = {
    x: 0, y: BOAT.y, width: BOAT.width, height: BOAT.height, invulnerable: 0,
  };
  const items = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    items.push({ active: false, kind: KIND_PARCEL, x: 0, y: 0, width: 0, height: 0, speed: 0, spin: 0, near: false });
  }
  const popups = [];
  for (let index = 0; index < POPUP_POOL; index += 1) {
    popups.push({ active: false, x: 0, y: 0, text: '', ttl: 0 });
  }
  const state = {
    boat, items, popups, score: 0, lives: LIVES, level: 1, elapsed: 0,
    delivered: 0, streak: 0, combo: 1, shield: false,
    logTimer: 0, rockTimer: 0, parcelTimer: 0, goldTimer: 0, heartTimer: 0,
    whirlTimer: 0, shieldTimer: 0,
    flow: 0,
  };

  function reset() {
    boat.x = (FIELD.width - boat.width) / 2;
    boat.invulnerable = 0;
    for (const item of items) item.active = false;
    for (const popup of popups) popup.active = false;
    state.score = 0;
    state.lives = LIVES;
    state.level = 1;
    state.elapsed = 0;
    state.delivered = 0;
    state.streak = 0;
    state.combo = 1;
    state.shield = false;
    state.logTimer = LOG.interval;
    state.rockTimer = ROCK.interval;
    state.parcelTimer = PARCEL.interval;
    state.goldTimer = GOLD.interval;
    state.heartTimer = HEART.interval;
    state.whirlTimer = WHIRLPOOL.interval;
    state.shieldTimer = SHIELD.interval;
    state.flow = 0;
  }

  function addPopup(x, y, text) {
    for (const popup of popups) {
      if (popup.active) continue;
      popup.active = true;
      popup.x = x;
      popup.y = y;
      popup.text = text;
      popup.ttl = POPUP_SECONDS;
      return;
    }
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
    item.near = false;
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

  function spawnWhirlpool() {
    spawn(KIND_WHIRLPOOL, WHIRLPOOL.size, WHIRLPOOL.size, WHIRLPOOL.speed + WHIRLPOOL.speedPerLevel * (state.level - 1));
  }

  function spawnShield() {
    spawn(KIND_SHIELD, SHIELD.width, SHIELD.height, SHIELD.speed);
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
    const nextLevel = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    if (nextLevel > state.level) events |= EVENT_LEVELUP;
    state.level = nextLevel;

    boat.x = Math.min(
      RIVER.right - boat.width,
      Math.max(RIVER.left, boat.x + direction * BOAT.speed * dt),
    );
    // A whirlpool drags the boat sideways toward its centre while it is near.
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active || item.kind !== KIND_WHIRLPOOL) continue;
      const dx = (item.x + item.width / 2) - (boat.x + boat.width / 2);
      const dy = (item.y + item.height / 2) - boat.y;
      if (Math.abs(dx) < WHIRLPOOL.pullRadius && Math.abs(dy) < WHIRLPOOL.pullRadius) {
        const pull = WHIRLPOOL.pull * (1 - Math.abs(dx) / WHIRLPOOL.pullRadius) * dt;
        boat.x = Math.min(
          RIVER.right - boat.width,
          Math.max(RIVER.left, boat.x + Math.sign(dx) * pull),
        );
      }
    }
    if (boat.invulnerable > 0) boat.invulnerable = Math.max(0, boat.invulnerable - dt);

    for (const popup of popups) {
      if (!popup.active) continue;
      popup.ttl -= dt;
      if (popup.ttl <= 0) popup.active = false;
    }

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
    state.whirlTimer -= dt;
    if (state.whirlTimer <= 0) {
      if (state.level >= 3) spawnWhirlpool();
      state.whirlTimer += WHIRLPOOL.interval;
    }
    state.shieldTimer -= dt;
    if (state.shieldTimer <= 0) {
      spawnShield();
      state.shieldTimer += SHIELD.interval;
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      item.y += item.speed * dt;
      if (item.y > FIELD.height + 40) {
        item.active = false;
        continue;
      }
      // Slipped past a hazard with almost no room to spare: a close-call bonus.
      if (
        !harmless && isHazard(item.kind) && !item.near
        && item.y > boat.y + boat.height
        && item.x + item.width > boat.x - NEAR_MISS.gap
        && item.x < boat.x + boat.width + NEAR_MISS.gap
      ) {
        item.near = true;
        state.score += NEAR_MISS.points;
        addPopup(boat.x + boat.width / 2, boat.y - 8, `Close call! +${NEAR_MISS.points}`);
        events |= EVENT_NEAR;
      }
      if (harmless || !overlaps(item, boat)) continue;
      if (item.kind === KIND_PARCEL) {
        item.active = false;
        state.streak += 1;
        refreshCombo();
        state.score += PARCEL.points * state.combo;
        state.delivered += 1;
        addPopup(boat.x + boat.width / 2, boat.y - 8, `+${PARCEL.points * state.combo}`);
        events |= EVENT_PARCEL;
      } else if (item.kind === KIND_GOLD) {
        item.active = false;
        state.streak += 1;
        refreshCombo();
        state.score += GOLD.points * state.combo;
        state.delivered += GOLD.deliveries;
        addPopup(boat.x + boat.width / 2, boat.y - 8, `+${GOLD.points * state.combo}`);
        events |= EVENT_GOLD;
      } else if (item.kind === KIND_HEART) {
        item.active = false;
        if (state.lives < LIVES) state.lives += 1;
        addPopup(boat.x + boat.width / 2, boat.y - 8, '+1 life');
        events |= EVENT_HEART;
      } else if (item.kind === KIND_SHIELD) {
        item.active = false;
        state.shield = true;
        addPopup(boat.x + boat.width / 2, boat.y - 8, 'Shield!');
        events |= EVENT_SHIELD;
      } else if (boat.invulnerable === 0) {
        item.active = false;
        if (state.shield) {
          state.shield = false;
          boat.invulnerable = BOAT.invulnerable;
          addPopup(boat.x + boat.width / 2, boat.y - 8, 'Shield saved you!');
          events |= EVENT_SHIELD_BLOCK;
        } else {
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
