/**
 * Application: builds the world from the house data, wires renderer, controls, UI and
 * the test/debug hooks (`window.__houseSim`).
 */
import * as THREE from 'three';
import { house } from './data/house';
import { OUTSIDE, levelById, placeAt, roomAt } from './data/topology';
import { DebugOverlay, estimateTextureMB, FrameStats } from './core/debug';
import { Loop } from './core/loop';
import { readParams } from './core/params';
import { createRenderer, handleContextLoss, handleResize, isTouchDevice } from './core/renderer';
import { DesktopInput } from './player/input-desktop';
import { TouchInput } from './player/input-touch';
import { PLAYER, PlayerController, yawToward } from './player/controller';
import { buildWorld } from './world/build';
import { createLighting } from './world/lighting';
import { createSky } from './world/sky';
import { LoadingScreen } from './ui/loading';
import { RoomToast } from './ui/toast';
import { StartOverlay } from './ui/hud';

export interface PlayerInfo {
  x: number;
  y: number;
  z: number;
  /** Degrees; 0 = looking toward plan north (−z), positive = turned left. */
  yaw: number;
  pitch: number;
  /** Room id on the current level (`outside` when not in a room). */
  room: string;
  /** Zone or room id used for the toast (e.g. `play-corner`, `entrance`, `parking`). */
  place: string;
  placeName: string;
  grounded: boolean;
}

export interface Stats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  textureMB: number;
  fps: number;
  frameMs: number;
  sceneTriangles: number;
  colliderTriangles: number;
}

export interface HouseSimHooks {
  ready: Promise<void>;
  isReady: boolean;
  teleport(
    x: number,
    y: number,
    z: number,
    yawDeg?: number,
    pitchDeg?: number,
  ): Promise<PlayerInfo>;
  getPlayer(): PlayerInfo;
  getStats(): Stats;
  /** Simulates `seconds` of walking in a world-space direction (deterministic, fixed steps). */
  walk(dirX: number, dirZ: number, seconds: number, run?: boolean): Promise<PlayerInfo>;
  /** Steers toward (x, z) until reached (≤ 0.15 m) or `timeout` simulated seconds. */
  walkTo(
    x: number,
    z: number,
    opts?: { run?: boolean; timeout?: number },
  ): Promise<{ reached: boolean; player: PlayerInfo }>;
  /** Free camera (physics paused) or `null` to return to the player. */
  view(pose: [number, number, number, number, number] | null): Promise<void>;
  look(yawDeg: number, pitchDeg: number): Promise<PlayerInfo>;
  nextFrame(): Promise<void>;
}

declare global {
  interface Window {
    __houseSim?: HouseSimHooks;
  }
}

const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;

export async function startApp(): Promise<void> {
  const params = readParams();
  const loading = new LoadingScreen();
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  loading.progress(0.1, 'Preparing renderer…');
  const canvas = document.createElement('canvas');
  canvas.className = 'view';
  canvas.tabIndex = 0;
  app.appendChild(canvas);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer(canvas, params.tonemap);
  } catch (e) {
    loading.error('WebGL 2 is not available on this device/browser.');
    throw e;
  }
  handleContextLoss(canvas, () => loading.error('Graphics context lost — reloading…'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 1000);
  handleResize(renderer, camera);

  await nextPaint();
  loading.progress(0.3, 'Building the house from the plans…');
  await nextPaint();
  const world = buildWorld(house);
  scene.add(world.group);
  createSky(scene);
  const touch = isTouchDevice();
  createLighting(scene, house.site, 2048);
  scene.updateMatrixWorld(true);
  world.group.traverse((o) => o.updateMatrix());

  loading.progress(0.7, 'Compiling shaders…');
  await nextPaint();
  const player = new PlayerController(world.bvh);
  const ground = levelById(house, 'ground');
  const start = house.site.start;
  player.teleport(
    start.position[0],
    start.position[1] + 0.05,
    start.position[2],
    yawToward(start.position[0], start.position[2], start.lookAt[0], start.lookAt[1]),
    rad(-4),
  );
  if (params.pose) {
    const [x, y, z, yawD = 0, pitchD = 0] = params.pose;
    player.teleport(x!, y!, z!, rad(yawD), rad(pitchD));
  }
  let freeView: number[] | null = params.view;
  player.applyToCamera(camera);
  renderer.compile(scene, camera);

  // Input & UI.
  const desktop = new DesktopInput(canvas);
  const touchInput = new TouchInput(canvas, ui);
  const toast = new RoomToast(ui);
  const crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  ui.appendChild(crosshair);
  for (const [cls, text] of [
    ['left', 'Move'],
    ['right', 'Look'],
  ] as const) {
    const h = document.createElement('div');
    h.className = `touch-hint ${cls}`;
    h.textContent = text;
    ui.appendChild(h);
  }
  if (touch) document.body.classList.add('touch');
  const overlay = new StartOverlay(ui, touch, () => {
    if (touch) {
      // Not available on iPhone Safari (only via ?Add to Home Screen?).
      const root: { requestFullscreen?: () => Promise<void> } = document.documentElement;
      root.requestFullscreen?.().catch(() => undefined);
    } else {
      desktop.requestLock();
    }
  });
  desktop.onLockChange = (locked) => {
    document.body.classList.toggle('locked', locked);
    if (!locked && !touch) overlay.show();
  };
  const debug = params.debug ? new DebugOverlay(ui) : null;
  const stats = new FrameStats();
  let lastPlace = '';

  const info = (): PlayerInfo => {
    const p = player.position;
    const lv = ground;
    const place = placeAt(lv, p.x, p.z);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: deg(player.yaw),
      pitch: deg(player.pitch),
      room: p.y < 2.5 ? roomAt(lv, p.x, p.z) : OUTSIDE,
      place: place.id,
      placeName: place.name,
      grounded: player.grounded,
    };
  };

  const wish = new THREE.Vector3();
  const LOOK_MOUSE = 0.0022;
  const LOOK_TOUCH = 0.0058;
  const loop = new Loop(
    {
      step: (dt) => {
        if (freeView) return;
        const d = desktop.move;
        const t = touchInput.state;
        const useTouch = Math.hypot(t.moveX, t.moveZ) > 0.01;
        const input = useTouch ? { x: t.moveX, z: t.moveZ, run: t.run } : d;
        player.wishFromInput(input, wish);
        player.step(wish, dt);
      },
      frame: (frameDt) => {
        const t0 = performance.now();
        const [mx, my] = desktop.takeLook();
        const [tx, ty] = touchInput.takeLook();
        player.look(-(mx * LOOK_MOUSE + tx * LOOK_TOUCH), -(my * LOOK_MOUSE + ty * LOOK_TOUCH));
        if (freeView) {
          const [x = 0, y = 0, z = 0, yawD = 0, pitchD = 0] = freeView;
          camera.position.set(x, y, z);
          camera.rotation.set(rad(pitchD), rad(yawD), 0, 'YXZ');
        } else {
          player.applyToCamera(camera);
        }
        renderer.render(scene, camera);
        const i = info();
        if (i.place !== lastPlace) {
          lastPlace = i.place;
          if (!overlay.visible || i.place !== OUTSIDE) toast.show(i.placeName);
        }
        if (stats.sample(frameDt, performance.now() - t0) && debug) {
          const r = renderer.info;
          debug.update({
            fps: stats.fps,
            frameMs: stats.frameMs,
            drawCalls: r.render.calls,
            triangles: r.render.triangles,
            geometries: r.memory.geometries,
            textures: r.memory.textures,
            textureMB: estimateTextureMB(scene),
            x: i.x,
            y: i.y,
            z: i.z,
            room: i.placeName,
          });
        }
      },
    },
    PLAYER.fixedDt,
  );

  const hooks: HouseSimHooks = {
    ready,
    isReady: false,
    teleport: async (x, y, z, yawD, pitchD) => {
      freeView = null;
      player.teleport(
        x,
        y,
        z,
        yawD === undefined ? undefined : rad(yawD),
        pitchD === undefined ? undefined : rad(pitchD),
      );
      // Settle deterministically (≤ 1 s of fixed steps) instead of relying on frame timing.
      for (let k = 0; k < 120 && (k < 12 || !player.grounded); k++) player.step(wish.set(0, 0, 0));
      await loop.nextFrame();
      return info();
    },
    getPlayer: info,
    getStats: () => {
      const r = renderer.info;
      return {
        drawCalls: r.render.calls,
        triangles: r.render.triangles,
        geometries: r.memory.geometries,
        textures: r.memory.textures,
        textureMB: estimateTextureMB(scene),
        fps: stats.fps,
        frameMs: stats.frameMs,
        sceneTriangles: world.triangles,
        colliderTriangles: world.colliderTriangles,
      };
    },
    walk: async (dx, dz, seconds, run = false) => {
      freeView = null;
      const len = Math.hypot(dx, dz) || 1;
      const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const n = Math.round(seconds / PLAYER.fixedDt);
      for (let k = 0; k < n; k++) player.step(wish.set((dx / len) * speed, 0, (dz / len) * speed));
      for (let k = 0; k < 30; k++) player.step(wish.set(0, 0, 0));
      await loop.nextFrame();
      return info();
    },
    walkTo: async (x, z, opts = {}) => {
      freeView = null;
      const speed = opts.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const maxSteps = Math.round((opts.timeout ?? 30) / PLAYER.fixedDt);
      let reached = false;
      for (let k = 0; k < maxSteps; k++) {
        const ddx = x - player.position.x;
        const ddz = z - player.position.z;
        const d = Math.hypot(ddx, ddz);
        if (d < 0.15) {
          reached = true;
          break;
        }
        const s = Math.min(speed, d * 4);
        player.yaw = yawToward(player.position.x, player.position.z, x, z);
        player.step(wish.set((ddx / d) * s, 0, (ddz / d) * s));
      }
      for (let k = 0; k < 30; k++) player.step(wish.set(0, 0, 0));
      await loop.nextFrame();
      return { reached, player: info() };
    },
    view: async (pose) => {
      freeView = pose;
      await loop.nextFrame();
    },
    look: async (yawD, pitchD) => {
      player.yaw = rad(yawD);
      player.pitch = rad(pitchD);
      await loop.nextFrame();
      return info();
    },
    nextFrame: () => loop.nextFrame(),
  };
  window.__houseSim = hooks;

  loading.progress(1, 'Ready');
  loop.start();
  await loop.nextFrame();
  loading.hide();
  hooks.isReady = true;
  resolveReady();
}
