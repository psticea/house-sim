/**
 * Drone (fly controls): a small sphere flying freely through and around the house, in
 * the "velocity mode" of camera drones — the sticks set the target speed, release them
 * and the drone brakes and hovers. Mode 2 sticks: left = throttle (up/down) + yaw,
 * right = pitch (forward/back) + roll (sideways). The camera sits on a stabilised gimbal:
 * it never banks, its tilt is set by the look input. Collides with the same BVH as the
 * walker (walls, glass, roof, terrain); stays within a box around the lot.
 */
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { FIELD_Y, TERRAIN } from '../data/terrain';
import { wrapAngle } from './controller';

export const DRONE = {
  radius: 0.18,
  /** m/s (horizontal), ×`fastFactor` with the fast modifier. */
  speed: 4,
  climb: 2.5,
  /** rad/s at full yaw stick. */
  yawRate: 1.6,
  fastFactor: 2.2,
  /** 1/s: how quickly the velocity follows the sticks (inertia). */
  response: 3.5,
  maxAltitude: 45,
  /** Horizontal bounds (m around the lot centre). */
  range: 70,
  center: [8.5, 6] as const,
} as const;

export interface DroneInput {
  /** −1…1: climb (+) / descend (−). */
  throttle: number;
  /** −1…1: turn right (+) / left (−). */
  yaw: number;
  /** −1…1: forward (+) / back (−). */
  pitch: number;
  /** −1…1: right (+) / left (−). */
  roll: number;
  fast: boolean;
}

export const NO_DRONE_INPUT: Readonly<DroneInput> = {
  throttle: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  fast: false,
};

const _box = new THREE.Box3();
const _tri = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _push = new THREE.Vector3();
const _target = new THREE.Vector3();

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

export class DroneController {
  /** Camera position. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  /** Gimbal tilt. */
  pitch = 0;
  private hits = 0;

  constructor(private bvh: MeshBVH) {}

  setCollider(bvh: MeshBVH): void {
    this.bvh = bvh;
  }

  /** Places the drone (e.g. at the walker's eye) and stops it. */
  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.resolve();
  }

  /** One fixed step. */
  step(input: DroneInput, dt: number): void {
    const fast = input.fast ? DRONE.fastFactor : 1;
    this.yaw = wrapAngle(this.yaw - clamp1(input.yaw) * DRONE.yawRate * dt);
    const f = clamp1(input.pitch) * DRONE.speed * fast;
    const r = clamp1(input.roll) * DRONE.speed * fast;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // forward = (−sin yaw, 0, −cos yaw), right = (cos yaw, 0, −sin yaw)
    _target.set(-s * f + c * r, clamp1(input.throttle) * DRONE.climb * fast, -c * f - s * r);
    const k = Math.min(1, dt * DRONE.response);
    this.velocity.addScaledVector(_target.sub(this.velocity), k);
    this.position.addScaledVector(this.velocity, dt);
    this.bound();
    _push.copy(this.position);
    this.resolve();
    _push.subVectors(this.position, _push);
    // Hitting something: drop the velocity component into it (slide along).
    const len = _push.length();
    if (len > 1e-6) {
      _push.divideScalar(len);
      const into = this.velocity.dot(_push);
      if (into < 0) this.velocity.addScaledVector(_push, -into);
    }
  }

  private bound(): void {
    const p = this.position;
    const [cx, cz] = DRONE.center;
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz);
    if (d > DRONE.range) {
      p.x = cx + (dx / d) * DRONE.range;
      p.z = cz + (dz / d) * DRONE.range;
    }
    // Beyond the terrain grid only the (non-colliding) field is left below.
    const overTerrain =
      p.x > TERRAIN.x0 && p.x < TERRAIN.x1 && p.z > TERRAIN.z0 && p.z < TERRAIN.z1;
    const floor = overTerrain ? -10 : FIELD_Y + DRONE.radius + 0.1;
    if (p.y < floor || p.y > DRONE.maxAltitude) {
      p.y = Math.min(DRONE.maxAltitude, Math.max(floor, p.y));
      this.velocity.y = 0;
    }
  }

  /** Pushes the sphere out of the collider (a few passes for corners). */
  private resolve(): void {
    const r = DRONE.radius;
    for (let pass = 0; pass < 3; pass++) {
      this.hits = 0;
      _box.min.set(this.position.x - r, this.position.y - r, this.position.z - r);
      _box.max.set(this.position.x + r, this.position.y + r, this.position.z + r);
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(this.position, _tri);
          _dir.subVectors(this.position, _tri);
          const d = _dir.length();
          if (d < r) {
            if (d < 1e-6) tri.getNormal(_dir);
            else _dir.divideScalar(d);
            this.position.addScaledVector(_dir, r - d);
            this.hits++;
          }
          return false;
        },
      });
      if (this.hits === 0) break;
    }
  }

  applyToCamera(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  look(dYaw: number, dPitch: number): void {
    this.yaw = wrapAngle(this.yaw + dYaw);
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, -1.5, 1.2);
  }
}
