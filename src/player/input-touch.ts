/**
 * Touch controls: floating virtual joystick on the left half (pushed to the rim = run),
 * drag-to-look on the right half. Multi-touch via Pointer Events (one pointer per role).
 */
export interface TouchState {
  moveX: number;
  moveZ: number;
  run: boolean;
  lookDX: number;
  lookDY: number;
}

const RADIUS = 56; // px, joystick travel
const RUN_AT = 0.92;

export class TouchInput {
  readonly state: TouchState = { moveX: 0, moveZ: 0, run: false, lookDX: 0, lookDY: 0 };
  private moveId: number | null = null;
  private lookId: number | null = null;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  active = false;

  constructor(
    private readonly surface: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    uiRoot.appendChild(this.base);
    surface.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    this.active = true;
    document.body.classList.add('touch');
    const leftHalf = e.clientX < window.innerWidth / 2;
    if (leftHalf && this.moveId === null) {
      this.moveId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.transform = `translate(${e.clientX - RADIUS}px, ${e.clientY - RADIUS}px)`;
      this.base.classList.add('on');
      this.setKnob(0, 0);
    } else if (!leftHalf && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic / inactive pointers cannot be captured; window listeners still work.
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.moveId) {
      e.preventDefault();
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx = (dx / len) * RADIUS;
        dy = (dy / len) * RADIUS;
      }
      const m = Math.min(1, len / RADIUS);
      // Small dead zone, then a linear response.
      const k = m < 0.12 ? 0 : (m - 0.12) / 0.88;
      this.state.moveX = len > 0 ? (dx / RADIUS) * (k / Math.max(m, 1e-6)) : 0;
      this.state.moveZ = len > 0 ? (-dy / RADIUS) * (k / Math.max(m, 1e-6)) : 0;
      this.state.run = m >= RUN_AT;
      this.setKnob(dx, dy);
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      this.state.lookDX += e.clientX - this.lastLook.x;
      this.state.lookDY += e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.moveId) {
      this.moveId = null;
      this.state.moveX = 0;
      this.state.moveZ = 0;
      this.state.run = false;
      this.base.classList.remove('on');
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.knob.classList.toggle('run', this.state.run);
  }

  /** Returns and clears the accumulated look delta (px). */
  takeLook(): [number, number] {
    const d: [number, number] = [this.state.lookDX, this.state.lookDY];
    this.state.lookDX = 0;
    this.state.lookDY = 0;
    return d;
  }
}
