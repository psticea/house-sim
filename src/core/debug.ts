/** `?debug` overlay: fps, frame time, renderer.info, estimated texture memory, player. */
import type * as THREE from 'three';

export interface DebugSample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  textureMB: number;
  x: number;
  y: number;
  z: number;
  room: string;
}

export class FrameStats {
  fps = 0;
  frameMs = 0;
  private frames = 0;
  private time = 0;
  private work = 0;

  /** Call once per frame with the frame interval and the CPU time spent on it. */
  sample(dt: number, workMs: number): boolean {
    this.frames++;
    this.time += dt;
    this.work += workMs;
    if (this.time >= 0.5) {
      this.fps = this.frames / this.time;
      this.frameMs = this.work / this.frames;
      this.frames = 0;
      this.time = 0;
      this.work = 0;
      return true;
    }
    return false;
  }
}

/** GPU memory of textures we create ourselves (I1: only the shadow map). */
export function estimateTextureMB(scene: THREE.Scene): number {
  let bytes = 0;
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow) {
      bytes += light.shadow.mapSize.x * light.shadow.mapSize.y * 4 * 2; // depth + colour RT
    }
  });
  return bytes / (1024 * 1024);
}

export class DebugOverlay {
  private readonly el: HTMLPreElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    root.appendChild(this.el);
  }

  update(s: DebugSample): void {
    this.el.textContent =
      `${s.fps.toFixed(0)} fps · ${s.frameMs.toFixed(1)} ms cpu\n` +
      `draw calls ${s.drawCalls} · tris ${(s.triangles / 1000).toFixed(1)}k\n` +
      `geometries ${s.geometries} · textures ${s.textures} (~${s.textureMB.toFixed(1)} MB)\n` +
      `pos ${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}\n` +
      `room ${s.room}`;
  }
}
