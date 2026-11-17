// ARUS — River Courier: every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// fit the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The river the boat sails on: banks outside this band are dry land. */
export const RIVER = { left: 180, right: 1100 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How many parcels must be delivered to complete the route and win the run. */
export const GOAL_DELIVERIES = 25;

export const BOAT = {
  width: 84,
  height: 30,
  y: 600,
  speed: 620,
  invulnerable: 1.6,
};

export const LIVES = 3;

export const LOG = {
  minWidth: 90,
  maxWidth: 150,
  height: 28,
  speed: 230,
  speedPerLevel: 20,
  interval: 0.7,
  intervalScale: 0.9,
  minInterval: 0.22,
};

export const ROCK = {
  size: 44,
  speed: 210,
  speedPerLevel: 14,
  interval: 1.7,
};

export const PARCEL = {
  width: 30,
  height: 26,
  speed: 200,
  speedPerLevel: 16,
  interval: 1.1,
  intervalJitter: 0.5,
  points: 10,
};

export const GOLD = {
  size: 30,
  speed: 200,
  interval: 9,
  points: 25,
  deliveries: 2,
};

export const HEART = {
  width: 28,
  height: 26,
  speed: 190,
  interval: 14,
};

/** Seconds of play per level, and the last level: speeds and spawn rates stop growing there. */
export const LEVEL = { seconds: 15, max: 10 };

/** How many floating things can exist at once; the pool is allocated once, at boot. */
export const POOL_SIZE = 72;

/** A parcel streak of 4 raises the score multiplier by one, up to x5; a hit resets it. */
export const COMBO_PER_STREAK = 4;
export const COMBO_MAX = 5;

export const PALETTE = {
  backdrop: '#0b1e26',
  river: '#14606e',
  riverDeep: '#0f4c5c',
  foam: '#bfe8e0',
  bank: '#c9a86a',
  bankEdge: '#a8854f',
  tree: '#2e7d4f',
  treeDark: '#256b41',
  house: '#e8dcc8',
  roof: '#b3543f',
  boat: '#8a5a2b',
  boatTrim: '#f2c94c',
  courier: '#f6d7a8',
  parcel: '#e8823a',
  parcelRibbon: '#f2c94c',
  gold: '#f2c94c',
  log: '#7a4a26',
  logEnd: '#a9713f',
  rock: '#8b93a3',
  heart: '#e5534b',
  panel: '#122b33',
  text: '#eef6f3',
  muted: '#9fb8b2',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'arus.best';
