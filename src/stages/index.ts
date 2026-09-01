// Stage module descriptors — registered under the "stage" seam.

import { HardenStage } from "./hardenStage.js";
import type { Stage } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const stageModules: Module<Stage>[] = [
  {
    id: "harden",
    seam: "stage",
    create: () => new HardenStage(),
  },
];
