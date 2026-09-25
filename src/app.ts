/**
 * Application: builds the world from the house data, wires renderer, controls, UI and
 * the test/debug hooks (`window.__houseSim`).
 */
import * as THREE from 'three';
import { house } from './data/house';
import type { LevelId } from './data/schema';
import { OUTSIDE, locate } from './data/topology';
import { DebugOverlay, estimateTextureMB, FrameStats } from './core/debug';
import { Loop } from './core/loop';
import { readParams, STYLE_NAMES, styleNameOf, DEFAULT_STYLE, type StyleName } from './core/params';
import {
  chooseQuality,
  DynamicResolution,
  lowerTier,
  probeGpu,
  TIER_SETTINGS,
  type Tier,
} from './core/quality';
import {
  createRenderer,
  handleContextLoss,
  handleResize,
  isTouchDevice,
  pixelRatioCap,
  setDynamicPixelRatio,
  setPixelRatioCap,
  setTierPixelRatioCap,
} from './core/renderer';
import { DesktopInput } from './player/input-desktop';
import { TouchInput } from './player/input-touch';
import { PLAYER, PlayerController, yawToward } from './player/controller';
import { buildWorld } from './world/build';
import { createLighting } from './world/lighting';
import { RealLook } from './world/realLook';
import { createSky } from './world/sky';
import { getStyle, isStyleBuilt, refreshStyledMeshes, setStyle, STYLE_LABELS } from './world/style';
import { LoadingScreen } from './ui/loading';
import { AssetProgress } from './ui/progress';
import { RoomToast } from './ui/toast';
import { StartOverlay } from './ui/hud';
import { StyleToggle } from './ui/style-toggle';

export interface PlayerInfo {
  x: number;
  y: number;
  z: number;
  /** Degrees; 0 = looking toward plan north (−z), positive = turned left. */
  yaw: number;
  pitch: number;
  /** Level the feet are on (`basement` | `ground` | `upper`). */
  level: LevelId;
  /** Room id (`outside` when not in a room); stair wells report the stair room below. */
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
  /** Estimated GPU texture memory (MB): maps, environment, probes, shadow maps. */
  textureMB: number;
  fps: number;
  frameMs: number;
  sceneTriangles: number;
  colliderTriangles: number;
  /** Quality tier in use (plan.md §3) and where it came from. */
  quality: Tier;
  qualitySource: 'url' | 'stored' | 'auto' | 'benchmark';
  pixelRatio: number;
  /** Realistic look: PBR textures + sky loaded, downloaded MB, probes captured. */
  texturesLoaded: boolean;
  textureDownloadMB: number;
  probes: number;
  /** Furniture triangles (0 until the furniture has been added after the first frame). */
  furnitureTriangles: number;
}

export interface HouseSimHooks {
  ready: Promise<void>;
  isReady: boolean;
  /** Furniture is built after the first walkable frame (plan.md I5 step 5.5). */
  furnitureReady: Promise<void>;
  furnished: boolean;
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
  /** Switches the look (`sketchup` | `borderlands` | `real`; `sketch` = `sketchup`) and waits for a rendered frame. */
  setStyle(name: StyleName | 'sketch'): Promise<void>;
  /** Current look (canonical name): stored choice / `?style=` / default `sketchup`. */
  getStyle(): StyleName;
  /**
   * Starts loading the realistic look's textures if needed and resolves once they,
   * the sky and the interior probes are in place (probes need the look to be shown).
   */
  texturesReady(): Promise<void>;
}

declare global {
  interface Window {
    __houseSim?: HouseSimHooks;
  }
}

const deg = THREE.MathUtils.radToDeg;
const rad = THREE.MathUtils.degToRad;

/** localStorage key of the chosen look (`?style=` overrides it for one load). */
export const STYLE_STORAGE_KEY = 'houseSim.style';

function storedStyle(): StyleName | null {
  try {
    return styleNameOf(window.localStorage.getItem(STYLE_STORAGE_KEY));
  } catch {
    return null; // storage disabled (privacy mode, sandboxed iframe)
  }
}

function storeStyle(name: StyleName): void {
  try {
    window.localStorage.setItem(STYLE_STORAGE_KEY, name);
  } catch {
    // not persisted — fine
  }
}

export async function startApp(): Promise<void> {
  const params = readParams();
  const loading = new LoadingScreen();
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let resolveFurnished!: () => void;
  const furnitureReady = new Promise<void>((r) => (resolveFurnished = r));
  let furnitureTriangles = 0;
  const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  loading.progress(0.1, 'Preparing renderer…');
  const canvas = document.createElement('canvas');
  canvas.className = 'view';
  canvas.tabIndex = 0;
  app.appendChild(canvas);
  // Quality tier (plan.md §3): `?quality=` → stored choice → GPU heuristic.
  let storage: Storage | null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const touch = isTouchDevice();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const choice = chooseQuality(window.location.search, storage, {
    gpu: probeGpu(),
    touch,
    ...(nav.deviceMemory ? { memoryGB: nav.deviceMemory } : {}),
  });
  let tier: Tier = choice.tier;
  let qualitySource: Stats['qualitySource'] = choice.source;
  const quality = { ...TIER_SETTINGS[tier] };
  setTierPixelRatioCap(quality.pixelRatio);
  // Automated browsers get deterministic frames: no benchmark, no dynamic resolution.
  const automated = navigator.webdriver;
  const dynres = !automated && !params.fixedResolution;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer(canvas, params.tonemap, quality.antialias);
  } catch (e) {
    loading.error('WebGL 2 is not available on this device/browser.');
    throw e;
  }
  handleContextLoss(canvas, () => loading.error('Graphics context lost — reloading…'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 1000);
  const applyResize = handleResize(renderer, camera);
  const dyn = new DynamicResolution(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));

  await nextPaint();
  loading.progress(0.3, 'Building the house from the plans…');
  await nextPaint();
  const world = buildWorld(house);
  scene.add(world.group);
  const sky = createSky(scene);
  const realFog = scene.fog as THREE.Fog;
  const lighting = createLighting(scene, house.site, quality.shadowMapSize);
  scene.updateMatrixWorld(true);
  world.group.traverse((o) => o.updateMatrix());
  const assetProgress = new AssetProgress(ui);
  const realLook = new RealLook({
    renderer,
    scene,
    camera,
    materials: world.materials,
    lighting,
    sky,
    fog: realFog,
    quality,
    onProgress: (f, done) => assetProgress.update(f, done),
  });
  // Textures of the realistic look stream in after the first walkable frame and after
  // the warm-up benchmark (which may still lower the texture tier).
  let benchmarkDone!: () => void;
  const benchmark = new Promise<void>((r) => (benchmarkDone = r));
  const switchStyle = (name: StyleName | 'sketch'): void => {
    setStyle(scene, name, {
      renderer,
      lighting,
      onPixelRatioCap: (cap) => {
        setPixelRatioCap(cap);
        dyn.setMax(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));
        if (dynres) setDynamicPixelRatio(dyn.ratio);
        applyResize();
      },
    });
    if (getStyle(scene) === 'real') void benchmark.then(() => realLook.load());
  };
  // `?style=` wins for this load, then the stored choice, then the default (SketchUp).
  const initialStyle = params.styleParam ?? storedStyle() ?? DEFAULT_STYLE;
  switchStyle(initialStyle);

  loading.progress(0.7, 'Compiling shaders…');
  await nextPaint();
  const player = new PlayerController(world.bvh);
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
  // Style toggle (pill, top right) + K: switch looks; the user's choice is remembered.
  let styleQueue = Promise.resolve();
  const chooseStyle = (name: StyleName): Promise<void> => {
    styleQueue = styleQueue.then(async () => {
      if (name === getStyle(scene)) return;
      if (!isStyleBuilt(scene, name)) {
        // First build of a look (edges, textures, shaders) can take a moment on phones.
        styleToggle.setBusy(true);
        await nextPaint();
        await nextPaint();
      }
      switchStyle(name);
      storeStyle(name);
      styleToggle.setBusy(false);
      styleToggle.set(getStyle(scene));
      toast.show(`${STYLE_LABELS[name]} style`);
    });
    return styleQueue;
  };
  const styleToggle = new StyleToggle(
    ui,
    STYLE_NAMES.map((name) => ({ name, label: STYLE_LABELS[name] })),
    getStyle(scene),
    (name) => void chooseStyle(name),
  );
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || e.repeat) return;
    const i = STYLE_NAMES.indexOf(getStyle(scene));
    void chooseStyle(STYLE_NAMES[(i + 1) % STYLE_NAMES.length]!);
  });
  const stats = new FrameStats();
  let lastPlace = '';

  const info = (): PlayerInfo => {
    const p = player.position;
    const loc = locate(house, p.x, p.y, p.z);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: deg(player.yaw),
      pitch: deg(player.pitch),
      level: loc.level,
      room: loc.room,
      place: loc.place.id,
      placeName: loc.place.name,
      grounded: player.grounded,
    };
  };

  // Room the free camera is in (screenshots / aerial views): above the roof = outdoors.
  const freeViewRoom = (): string =>
    camera.position.y > 7.6
      ? OUTSIDE
      : locate(house, camera.position.x, camera.position.y - PLAYER.eye, camera.position.z).room;
  // 1-s warm-up benchmark (auto tier only): a slow start lowers the tier before the
  // realistic textures are requested. Then dynamic resolution takes over.
  let benchActive = choice.source === 'auto' && !automated;
  if (!benchActive) benchmarkDone();
  const bench: number[] = [];
  const frameTimes = (dt: number): void => {
    const ms = dt * 1000;
    if (benchActive) {
      bench.push(ms);
      if (bench.reduce((a, b) => a + b, 0) >= 1000) {
        benchActive = false;
        const median = [...bench].sort((a, b) => a - b)[Math.floor(bench.length / 2)] ?? 0;
        if (median > 33 && tier !== 'low') {
          tier = lowerTier(tier);
          qualitySource = 'benchmark';
          const next = TIER_SETTINGS[tier];
          quality.pixelRatio = next.pixelRatio;
          quality.textures = next.textures;
          quality.anisotropy = next.anisotropy;
          quality.probes = next.probes;
          setTierPixelRatioCap(quality.pixelRatio);
          dyn.setMax(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));
          applyResize();
        }
        benchmarkDone();
      }
    }
    if (dynres) {
      const r = dyn.update(ms);
      if (r !== null) {
        setDynamicPixelRatio(r);
        applyResize();
      }
    }
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
        const i = info();
        realLook.update(frameDt, freeView ? freeViewRoom() : i.room, getStyle(scene) === 'real');
        renderer.render(scene, camera);
        frameTimes(frameDt);
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
            textureMB: estimateTextureMB(scene, realLook.ownedTextures()),
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
    furnitureReady,
    furnished: false,
    teleport: async (x, y, z, yawD, pitchD) => {
      freeView = null;
      realLook.snap();
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
        textureMB: estimateTextureMB(scene, realLook.ownedTextures()),
        fps: stats.fps,
        frameMs: stats.frameMs,
        sceneTriangles: world.triangles,
        colliderTriangles: world.colliderTriangles,
        quality: tier,
        qualitySource,
        pixelRatio: renderer.getPixelRatio(),
        texturesLoaded: realLook.loaded,
        textureDownloadMB: realLook.bytes / (1024 * 1024),
        probes: realLook.probeCount,
        furnitureTriangles,
      };
    },
    walk: async (dx, dz, seconds, run = false) => {
      freeView = null;
      realLook.snap();
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
      realLook.snap();
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
      realLook.snap();
      await loop.nextFrame();
    },
    look: async (yawD, pitchD) => {
      player.yaw = rad(yawD);
      player.pitch = rad(pitchD);
      await loop.nextFrame();
      return info();
    },
    nextFrame: () => loop.nextFrame(),
    setStyle: async (name) => {
      switchStyle(name);
      styleToggle.set(getStyle(scene));
      await loop.nextFrame();
    },
    getStyle: () => getStyle(scene),
    texturesReady: async () => {
      await benchmark;
      await realLook.load();
      // Probes are captured a few frames after loading, while the realistic look shows.
      for (let k = 0; k < 20 && realLook.probesPending; k++) {
        if (getStyle(scene) !== 'real') break;
        await loop.nextFrame();
      }
      await loop.nextFrame();
    },
  };
  window.__houseSim = hooks;

  loading.progress(1, 'Ready');
  loop.start();
  await loop.nextFrame();
  loading.hide();
  hooks.isReady = true;
  resolveReady();

  // Furniture (plan.md I5 step 5.5): the house is walkable first; the furniture code is
  // a separate chunk, loaded and built (merged per material) right after, in an idle
  // slot. The current look styles the new meshes, and the static shadow map and interior
  // probes are rendered again.
  const addFurniture = async (): Promise<void> => {
    const { attachFurniture } = await import('./world/furniture');
    const res = attachFurniture(world);
    player.setCollider(world.bvh);
    refreshStyledMeshes(scene, res.merged);
    switchStyle(getStyle(scene));
    renderer.shadowMap.needsUpdate = true;
    realLook.refreshProbes();
    furnitureTriangles = res.triangles;
    hooks.furnished = true;
    resolveFurnished();
  };
  const idle = (cb: () => void): void => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout: 300 });
    else setTimeout(cb, 30);
  };
  void loop.nextFrame().then(() =>
    idle(() => {
      addFurniture().catch((e: unknown) => console.error('Furniture failed to load', e));
    }),
  );
}
