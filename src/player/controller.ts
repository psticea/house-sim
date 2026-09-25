/**
 * Capsule character controller on a static BVH collider (three-mesh-bvh shapecast,
 * after the library's characterMovement example): fixed 120 Hz steps, gravity,
 * automatic step-up ≤ 0.2 m, no tunnelling (≤ 2.5 cm travel per step at run speed).
 */
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

export const PLAYER = {
  radius: 0.25,
  height: 1.75,
  eye: 1.65,
  walkSpeed: 1.4,
  runSpeed: 3.0,
  stepUp: 0.2,
  gravity: -9.81,
  fixedDt: 1 / 120,
} as const;

export interface MoveInput {
  /** Local move vector: x = strafe right, z = forward; length ≤ 1. */
  x: number;
  z: number;
  run: boolean;
}

export interface WorldMove {
  /** World-space horizontal direction (normalised) — used by scripted walks. */
  dx: number;
  dz: number;
  run: boolean;
}

const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class PlayerController {
  /** Feet position. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;

  constructor(private readonly bvh: MeshBVH) {}

  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.grounded = false;
    // Settle onto the ground right away.
    this.resolve();
  }

  /**
   * Push the capsule out of the collider. Returns the largest upward push normal (y).
   * In `ground` mode (the settle-down phase of a step) contacts below the bottom sphere
   * lift the capsule vertically, so it rides up onto step edges instead of being pushed
   * back by them.
   */
  private resolve(ground = false): number {
    const r = PLAYER.radius;
    _seg.start.set(this.position.x, this.position.y + r, this.position.z);
    _seg.end.set(this.position.x, this.position.y + PLAYER.height - r, this.position.z);
    _box.makeEmpty().expandByPoint(_seg.start).expandByPoint(_seg.end);
    _box.min.addScalar(-r - 0.02);
    _box.max.addScalar(r + 0.02);
    let up = -1;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const d = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
        if (d < r) {
          if (ground && _triPoint.y < _seg.start.y - 0.01) {
            const dh = Math.hypot(_triPoint.x - _seg.start.x, _triPoint.z - _seg.start.z);
            const lift = _triPoint.y + Math.sqrt(Math.max(0, r * r - dh * dh)) - _seg.start.y;
            const topY = Math.max(tri.a.y, tri.b.y, tri.c.y);
            tri.getNormal(_dir);
            // Upward faces or the top edge of a riser: ride up. Wall faces fall through.
            const support = _dir.y > 0.3 || _triPoint.y > topY - 1e-3;
            if (support && lift >= -1e-4 && lift <= PLAYER.stepUp + 0.05) {
              _seg.start.y += Math.max(0, lift);
              _seg.end.y += Math.max(0, lift);
              up = 1;
              return false;
            }
          }
          const depth = r - d;
          _dir.subVectors(_capPoint, _triPoint);
          if (_dir.lengthSq() < 1e-12) tri.getNormal(_dir);
          _dir.normalize();
          _seg.start.addScaledVector(_dir, depth);
          _seg.end.addScaledVector(_dir, depth);
          if (_dir.y > up) up = _dir.y;
        }
        return false;
      },
    });
    this.position.set(_seg.start.x, _seg.start.y - r, _seg.start.z);
    return up;
  }

  /** Desired horizontal velocity for a local input vector (camera-relative). */
  wishFromInput(input: MoveInput, out: THREE.Vector3): THREE.Vector3 {
    const len = Math.min(1, Math.hypot(input.x, input.z));
    const speed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * len;
    if (len < 1e-3) return out.set(0, 0, 0);
    const nx = input.x / Math.max(len, 1e-6);
    const nz = input.z / Math.max(len, 1e-6);
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // forward = (−sin yaw, 0, −cos yaw), right = (cos yaw, 0, −sin yaw)
    out.set(-s * nz + c * nx, 0, -c * nz - s * nx).multiplyScalar(speed);
    return out;
  }

  /** One fixed physics step with a desired horizontal velocity. */
  step(wish: THREE.Vector3, dt: number = PLAYER.fixedDt): void {
    const accel = Math.min(1, dt * (this.grounded ? 12 : 2));
    this.velocity.x += (wish.x - this.velocity.x) * accel;
    this.velocity.z += (wish.z - this.velocity.z) * accel;
    if (this.grounded) this.velocity.y = -0.5;
    else this.velocity.y = Math.max(this.velocity.y + PLAYER.gravity * dt, -30);

    const wasGrounded = this.grounded;
    if (wasGrounded) this.position.y += PLAYER.stepUp;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolve();
    if (wasGrounded) this.position.y -= PLAYER.stepUp;
    this.position.y += this.velocity.y * dt;
    const up = this.resolve(true);
    this.grounded = up > 0.6;
    if (!this.grounded && wasGrounded) this.velocity.y = 0;
    // Safety net: never fall out of the world.
    if (this.position.y < -20) this.teleport(this.position.x, 2, this.position.z);
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + PLAYER.eye, this.position.z);
  }

  applyToCamera(camera: THREE.PerspectiveCamera): void {
    this.eye(camera.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  look(dYaw: number, dPitch: number): void {
    this.yaw = wrapAngle(this.yaw + dYaw);
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -1.45, 1.45);
  }
}

export const wrapAngle = (a: number): number => {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
};

/** Yaw (radians) that looks from (x, z) toward (tx, tz). Yaw 0 = looking toward −z. */
export const yawToward = (x: number, z: number, tx: number, tz: number): number =>
  Math.atan2(-(tx - x), -(tz - z));
