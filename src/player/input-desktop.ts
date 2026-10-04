import type { DroneInput } from './drone';

/** Desktop controls: WASD / arrow keys, Shift = run, mouse look via Pointer Lock. */
export class DesktopInput {
  private readonly keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.surface;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
  }

  requestLock(): void {
    const req = this.surface.requestPointerLock() as Promise<void> | undefined;
    // Chrome returns a promise; failure (e.g. headless, iframe) is not fatal.
    req?.catch(() => undefined);
  }

  get move(): { x: number; z: number; run: boolean } {
    const k = this.keys;
    const x =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const z =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  /**
   * Fly controls: W A S D / arrows — forward, back, sideways; E / Space — up; Q / C — down;
   * Shift — fast. Turning is done with the mouse.
   */
  get fly(): DroneInput {
    const k = this.keys;
    const m = this.move;
    const up = k.has('KeyE') || k.has('Space') ? 1 : 0;
    const down = k.has('KeyQ') || k.has('KeyC') ? 1 : 0;
    return { throttle: up - down, yaw: 0, pitch: m.z, roll: m.x, fast: m.run };
  }

  takeLook(): [number, number] {
    const d: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0;
    this.lookDY = 0;
    return d;
  }
}
