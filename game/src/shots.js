// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (look ahead each way the boat could move, keep clear of logs
// and rocks, chase the lowest parcel when that is safe), so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { BOAT, FIELD, RIVER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, isHazard } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;
/**
 * How far ahead, in seconds, the autopilot checks each way it could move: the
 * play scene's pilot looks well ahead and keeps all its lives; the end scene's
 * looks only a moment ahead, so it is caught out once the river speeds up, as
 * a hurried player is.
 */
const HORIZON_PLAY = 0.8;
const HORIZON_END = 0.08;
const SAMPLE = 1 / 30;
const DIRECTIONS = [0, -1, 1];
/** Extra room, each side, it keeps between the boat and a hazard. */
const MARGIN = 12;

/** Seconds until moving in `direction` (-1, 0, 1) runs the boat into a hazard; Infinity when it never does. */
function timeToHit(state, direction, horizon) {
  const boat = state.boat;
  for (let t = SAMPLE; t <= horizon; t += SAMPLE) {
    const x = Math.min(
      RIVER.right - boat.width,
      Math.max(RIVER.left, boat.x + direction * BOAT.speed * t),
    );
    for (let index = 0; index < state.items.length; index += 1) {
      const item = state.items[index];
      if (!item.active || !isHazard(item.kind)) continue;
      const y = item.y + item.speed * t;
      if (
        y + item.height > boat.y && y < boat.y + boat.height
        && item.x < x + boat.width + MARGIN && item.x + item.width > x - MARGIN
      ) return t;
    }
  }
  return Infinity;
}

/** Of the safe ways to move, the one toward the lowest parcel (or the centre); else the one that is hit last. */
function autopilot(state, horizon) {
  const boat = state.boat;
  let target = null;
  for (let index = 0; index < state.items.length; index += 1) {
    const item = state.items[index];
    if (item.active && !isHazard(item.kind) && (target === null || item.y > target.y)) target = item;
  }
  const goal = target === null ? FIELD.width / 2 : target.x + target.width / 2;
  const centre = boat.x + boat.width / 2;
  const wanted = goal > centre + 10 ? 1 : goal < centre - 10 ? -1 : 0;
  let best = wanted;
  let bestTime = timeToHit(state, wanted, horizon);
  for (let index = 0; index < DIRECTIONS.length && bestTime !== Infinity; index += 1) {
    const time = timeToHit(state, DIRECTIONS[index], horizon);
    if (time > bestTime) {
      bestTime = time;
      best = DIRECTIONS[index];
    }
  }
  return best;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, 0, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const horizon = name === 'end' ? HORIZON_END : HORIZON_PLAY;
  let finished = 0;
  for (let index = 0; index < limit / STEP; index += 1) {
    finished = world.step(STEP, autopilot(world.state, horizon), false);
    if (finished & (EVENT_OVER | EVENT_WIN)) break;
  }
  if (finished & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
