// Stage module descriptors — registered under the "stage" seam.

import { DevelopStage } from "./developStage.js";
import { HardenStage } from "./hardenStage.js";
import { TestStage } from "./testStage.js";
import type { Stage } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const stageModules: Module<Stage>[] = [
  {
    id: "harden",
    seam: "stage",
    create: () => new HardenStage(),
  },
  {
    id: "develop",
    seam: "stage",
    create: () => new DevelopStage(),
  },
  {
    id: "test",
    seam: "stage",
    create: () => new TestStage(),
  },
];
