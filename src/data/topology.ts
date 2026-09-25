/**
 * Space topology: which rooms connect through open doors / passages, and which room
 * contains a point. Used by the room toast, the reachability test and e2e checks.
 */
import { isPassable, pointInPolygon, wallFrame, wallThickness } from './geometry2d';
import type { HouseModel, Level, LevelId, Opening, Polygon, Room, Vec2, Zone } from './schema';

export const OUTSIDE = 'outside';

/** Room id containing (x, z) on a level (rooms only, not zones), or OUTSIDE. */
export function roomAt(level: Level, x: number, z: number): string {
  for (const r of level.rooms) if (pointInPolygon(x, z, r.polygon)) return r.id;
  return OUTSIDE;
}

/** Zone (priority) or room at a point. */
export function placeAt(level: Level, x: number, z: number): { id: string; name: string } {
  const zone: Zone | undefined = level.zones.find((zn) => pointInPolygon(x, z, zn.polygon));
  if (zone) return { id: zone.id, name: zone.name };
  const room: Room | undefined = level.rooms.find((r) => pointInPolygon(x, z, r.polygon));
  if (room) return { id: room.id, name: room.name };
  return { id: OUTSIDE, name: 'Garden' };
}

/** The two points just beyond both faces of an opening (at its centre). */
export function openingSides(level: Level, o: Opening, clearance = 0.3): [Vec2, Vec2] {
  const wall = level.walls.find((w) => w.id === o.wall);
  if (!wall) throw new Error(`Opening ${o.id} references unknown wall ${o.wall}`);
  const { dir, left } = wallFrame(wall);
  const t = wallThickness(wall) / 2 + clearance;
  const u = o.offset + (o.kind === 'sliding' ? o.width / 4 : o.width / 2);
  const cx = wall.from[0] + dir[0] * u;
  const cz = wall.from[1] + dir[1] * u;
  return [
    [cx + left[0] * t, cz + left[1] * t],
    [cx - left[0] * t, cz - left[1] * t],
  ];
}

function sharedBoundary(a: Polygon, b: Polygon): number {
  // Total length of collinear overlapping edges between two rectilinear polygons.
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const [ax0, az0] = a[i]!;
    const [ax1, az1] = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const [bx0, bz0] = b[j]!;
      const [bx1, bz1] = b[(j + 1) % b.length]!;
      if (Math.abs(ax0 - ax1) < 1e-6 && Math.abs(bx0 - bx1) < 1e-6 && Math.abs(ax0 - bx0) < 1e-6) {
        const lo = Math.max(Math.min(az0, az1), Math.min(bz0, bz1));
        const hi = Math.min(Math.max(az0, az1), Math.max(bz0, bz1));
        if (hi > lo) total += hi - lo;
      } else if (
        Math.abs(az0 - az1) < 1e-6 &&
        Math.abs(bz0 - bz1) < 1e-6 &&
        Math.abs(az0 - bz0) < 1e-6
      ) {
        const lo = Math.max(Math.min(ax0, ax1), Math.min(bx0, bx1));
        const hi = Math.min(Math.max(ax0, ax1), Math.max(bx0, bx1));
        if (hi > lo) total += hi - lo;
      }
    }
  }
  return total;
}

export interface Edge {
  a: string;
  b: string;
  via: string;
}

/** Adjacency graph of the spaces of a level: doors, open boundaries, exterior rooms. */
export function spaceGraph(level: Level, minPassage = 0.6): Edge[] {
  const edges: Edge[] = [];
  for (const o of level.openings) {
    if (!isPassable(o) || o.width < minPassage) continue;
    const [p, q] = openingSides(level, o);
    const a = roomAt(level, p[0], p[1]);
    const b = roomAt(level, q[0], q[1]);
    if (a !== b) edges.push({ a, b, via: o.id });
  }
  const rooms = level.rooms;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (sharedBoundary(rooms[i]!.polygon, rooms[j]!.polygon) >= minPassage) {
        edges.push({ a: rooms[i]!.id, b: rooms[j]!.id, via: 'open boundary' });
      }
    }
  }
  for (const r of rooms) if (r.exterior) edges.push({ a: r.id, b: OUTSIDE, via: 'exterior' });
  return edges;
}

/** Breadth-first reachability from `start` over the level graph. */
export function reachable(level: Level, start: string = OUTSIDE): Set<string> {
  const edges = spaceGraph(level);
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      const next = e.a === cur ? e.b : e.b === cur ? e.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function levelById(model: HouseModel, id: LevelId): Level {
  const l = model.levels.find((lv) => lv.id === id);
  if (!l) throw new Error(`no level ${id}`);
  return l;
}

/** Feet within this distance below a level's floor still count as being on it. */
const LEVEL_TOLERANCE = 0.6;

export interface Location {
  level: LevelId;
  room: string;
  place: { id: string; name: string };
}

/**
 * Level, room and toast place of a player at (x, y, z) (y = feet). The level is the
 * highest one whose floor is at most 0.6 m above the feet; where that level has no
 * room (stair well, landing), the room of the level below is used (e.g. the upper
 * part of the main stair still reads as "Stairs").
 */
export function locate(model: HouseModel, x: number, y: number, z: number): Location {
  const levels = [...model.levels].sort((a, b) => b.floorY - a.floorY);
  const i = Math.max(
    0,
    levels.findIndex((l) => y >= l.floorY - LEVEL_TOLERANCE),
  );
  const own = levels[i]!;
  for (let k = i; k < levels.length; k++) {
    const lv = levels[k]!;
    const place = placeAt(lv, x, z);
    if (place.id !== OUTSIDE) return { level: own.id, room: roomAt(lv, x, z), place };
  }
  return { level: own.id, room: OUTSIDE, place: { id: OUTSIDE, name: 'Garden' } };
}

export interface HouseEdge {
  a: string;
  b: string;
  via: string;
}

/** Node id of a room in the whole-house graph (`outside` stays `outside`). */
export const nodeId = (level: LevelId, room: string): string =>
  room === OUTSIDE ? OUTSIDE : `${level}:${room}`;

/** Whole-house graph: every level's space graph plus the stairs between levels. */
export function houseGraph(model: HouseModel): HouseEdge[] {
  const edges: HouseEdge[] = [];
  for (const level of model.levels) {
    for (const e of spaceGraph(level)) {
      edges.push({ a: nodeId(level.id, e.a), b: nodeId(level.id, e.b), via: e.via });
    }
    for (const st of level.stairs) {
      const [lo, hi] = st.connects;
      edges.push({ a: nodeId(lo.level, lo.room), b: nodeId(hi.level, hi.room), via: st.id });
    }
  }
  return edges;
}

/** Rooms (as `level:room` node ids) reachable from outside over doors and stairs. */
export function reachableAll(model: HouseModel, start: string = OUTSIDE): Set<string> {
  const edges = houseGraph(model);
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      const next = e.a === cur ? e.b : e.b === cur ? e.a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
