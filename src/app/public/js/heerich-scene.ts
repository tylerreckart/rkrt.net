/// <reference path="../../../types/heerich.d.ts" />
import { Heerich } from 'heerich';

// ─── Scene constants ──────────────────────────────────────────────────────────

const FIELD_W   = 20;   // lane count (x)
const TILE      = 18;   // pixels per voxel
const CAM_X     = FIELD_W / 2;
const CAM_DIST  = 20;

// Fixed viewBox — same tunnel crop as before.
const VIEW: [number, number, number, number] = [50, -12, 260, 180];

// Discrete z and y positions cubes can occupy.
const Z_SLOTS = [4, 7, 11, 15, 19, 23, 27];
const Y_SLOTS = [8, 6, 4]; // floor + two floating levels (gap between each)

// How many cubes to keep alive at once.
const TARGET = 40;

// Lifespan range in milliseconds.
const TTL_MIN = 400;
const TTL_MAX = 1800;

// ─── Face styles ─────────────────────────────────────────────────────────────

const STYLE = {
  default: { fill: 'var(--white)',  stroke: 'var(--black)', strokeWidth: 0.6 },
  top:     { fill: 'var(--purple)', stroke: 'var(--black)', strokeWidth: 0.6 },
  right:   { fill: 'var(--bg)',     stroke: 'var(--black)', strokeWidth: 0.6 },
  left:    { fill: 'var(--bg)',     stroke: 'var(--black)', strokeWidth: 0.6 },
  back:    { fill: 'var(--bg)',     stroke: 'var(--black)', strokeWidth: 0.6 },
};

// ─── Cube type ────────────────────────────────────────────────────────────────

interface Cube {
  x:       number;
  y:       number;
  z:       number;
  expires: number; // ms timestamp
}

function spawnCube(now: number): Cube {
  return {
    x:       Math.floor(Math.random() * FIELD_W),
    y:       Y_SLOTS[Math.floor(Math.random() * Y_SLOTS.length)],
    z:       Z_SLOTS[Math.floor(Math.random() * Z_SLOTS.length)],
    expires: now + TTL_MIN + Math.random() * (TTL_MAX - TTL_MIN),
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function initHeerichBackground(): void {
  const page = document.getElementById('page');
  if (!page) return;

  const bg = document.createElement('div');
  bg.id = 'heerich-bg';
  page.prepend(bg);

  const h = new Heerich({ tile: [TILE, TILE, TILE] });
  h.setCamera({ type: 'perspective', position: [CAM_X, 0], distance: CAM_DIST });

  // Pre-populate so the scene isn't empty on first paint.
  let cubes: Cube[] = Array.from({ length: TARGET }, () => spawnCube(
    performance.now() - Math.random() * TTL_MAX  // stagger initial lifespans
  ));

  let lastT = 0;

  function tick(t: number) {
    requestAnimationFrame(tick);

    const dt = t - lastT;
    if (dt < 16) return; // ~60 fps cap
    lastT = t;

    // Expire old cubes and top up to TARGET.
    cubes = cubes.filter(c => c.expires > t);
    while (cubes.length < TARGET) cubes.push(spawnCube(t));

    // Render.
    h.clear();
    h.batch(() => {
      for (const c of cubes) {
        h.applyGeometry({
          type:     'box',
          position: [c.x, c.y, c.z],
          size:     [1, 1, 1],
          style:    STYLE,
        });
      }
    });

    bg.innerHTML = h.toSVG({ viewBox: VIEW });

    const svg = bg.querySelector('svg');
    if (svg) svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
  }

  requestAnimationFrame(tick);
}
