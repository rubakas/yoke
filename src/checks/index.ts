// Check module descriptors — registered under the "check" seam.

import type { Module } from "../module/types.js";
import type { Check } from "../module/seams.js";
import { CriticCheck } from "./critic.js";
import { SecurityCheck } from "./security.js";

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
