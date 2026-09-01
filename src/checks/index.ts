// Check module descriptors — registered under the "check" seam.

import { CriticCheck } from "./critic.js";
import { SecurityCheck } from "./security.js";
import type { Check } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const checkModules: Module<Check>[] = [
  {
    id: "critic",
    seam: "check",
    create: () => new CriticCheck(),
  },
  {
    id: "security",
    seam: "check",
    create: () => new SecurityCheck(),
  },
];
