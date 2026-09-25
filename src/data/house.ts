/** The complete house model assembled from the per-level transcriptions. */
import { basementLevel } from './basement';
import { groundLevel } from './ground';
import { GRID_X, GRID_Z } from './grid';
import { exterior, roof } from './roof';
import type { HouseModel } from './schema';
import { site } from './site';
import { upperLevel } from './upper';

export const house: HouseModel = {
  grid: { x: GRID_X, z: GRID_Z },
  levels: [basementLevel, groundLevel, upperLevel],
  roof,
  exterior,
  site,
};
