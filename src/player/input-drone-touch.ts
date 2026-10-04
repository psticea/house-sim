/**
 * Fly controls on touch screens: two fixed virtual sticks in the bottom corners, where the
 * thumbs rest when holding a phone (classic drone transmitter, Mode 2):
 *   left stick  — up/down = climb/descend (throttle), left/right = turn (yaw);
 *   right stick — up/down = forward/back (pitch), left/right = sideways (roll).
 * Both are spring-centred. A touch near a stick grabs it (its value is the offset from the
 * stick's centre); a drag anywhere else tilts / turns the camera gimbal.
 */
import type { DroneInput } from './drone';

const RADIUS = 52; // px, stick travel (knob centre → rim)
/** A touch this far from a stick's centre still grabs it (thumbs land imprecisely). */
const GRAB = RADIUS * 1.9;
const DEAD = 0.1;

type Side = 'left' | 'right';

interface Stick {
  base: HTMLDivElement;
  knob: HTMLDivElement;
  id: number | null;
  cx: number;
  cy: number;
  x: number;
  y: number;
}

const LABELS: Record<Side, [string, string]> = {
  left: ['Up · Down', 'Turn'],
  right: ['Forward · Back', 'Sideways'],
};

export class DroneTouchInput {
  private readonly root: HTMLDivElement;
  private readonly sticks: Record<Side, Stick>;
  private lookId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private lookDX = 0;
  private lookDY = 0;
  private on = false;

  constructor(
    private readonly surface: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'fly-sticks';
    const make = (side: Side): Stick => {
      const base = document.createElement('div');
      base.className = `fly-stick ${side}`;
      base.dataset.stick = side;
      const [v, h] = LABELS[side];
      base.innerHTML = `<span class="fly-label v">${v}</span><span class="fly-label h">${h}</span>`;
      const knob = document.createElement('div');
      knob.className = 'fly-knob';
      base.appendChild(knob);
      this.root.appendChild(base);
      return { base, knob, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    };
    this.sticks = { left: make('left'), right: make('right') };
    uiRoot.appendChild(this.root);
    surface.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  /** Only listens (and shows the sticks, via `body.fly`) while fly controls are on. */
  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    this.on = on;
    if (!on) this.reset();
  }

  /** Current stick values (dead zone applied). */
  get input(): DroneInput {
    const l = this.sticks.left;
    const r = this.sticks.right;
    return {
      throttle: -dead(l.y),
      yaw: dead(l.x),
      pitch: -dead(r.y),
      roll: dead(r.x),
      fast: false,
    };
  }

  /** Returns and clears the accumulated gimbal drag (px). */
  takeLook(): [number, number] {
    const d: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0;
    this.lookDY = 0;
    return d;
  }

  private reset(): void {
    for (const s of Object.values(this.sticks)) this.release(s);
    this.lookId = null;
    this.lookDX = 0;
    this.lookDY = 0;
  }

  private release(s: Stick): void {
    s.id = null;
    s.x = 0;
    s.y = 0;
    s.knob.style.transform = '';
    s.base.classList.remove('on');
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.on || e.pointerType === 'mouse') return;
    e.preventDefault();
    document.body.classList.add('touch');
    let best: Stick | null = null;
    let bestD = GRAB;
    for (const s of Object.values(this.sticks)) {
      if (s.id !== null) continue;
      const r = s.base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (r.width > 0 && d < bestD) {
        best = s;
        bestD = d;
        s.cx = cx;
        s.cy = cy;
      }
    }
    if (best) {
      best.id = e.pointerId;
      best.base.classList.add('on');
      this.moveStick(best, e.clientX, e.clientY);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic / inactive pointers cannot be captured; window listeners still work.
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.on) return;
    for (const s of Object.values(this.sticks)) {
      if (s.id === e.pointerId) {
        e.preventDefault();
        this.moveStick(s, e.clientX, e.clientY);
        return;
      }
    }
    if (e.pointerId === this.lookId) {
      e.preventDefault();
      this.lookDX += e.clientX - this.lastLook.x;
      this.lookDY += e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  };

  private onUp = (e: PointerEvent): void => {
    for (const s of Object.values(this.sticks)) if (s.id === e.pointerId) this.release(s);
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  private moveStick(s: Stick, px: number, py: number): void {
    let dx = px - s.cx;
    let dy = py - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    s.x = dx / RADIUS;
    s.y = dy / RADIUS;
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}

/** Per-axis dead zone, then a linear response up to ±1. */
function dead(v: number): number {
  const a = Math.abs(v);
  return a < DEAD ? 0 : (Math.sign(v) * (a - DEAD)) / (1 - DEAD);
}
