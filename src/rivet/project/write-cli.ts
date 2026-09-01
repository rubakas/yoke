#!/usr/bin/env tsx
// Generates rivet/spec-creation.rivet-project from the programmatic builder.
// Usage: pnpm rivet:build-project

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultRegistry } from "../registry.js";
import { writeSpecCreationProject } from "./write.js";

const outPath = "rivet/spec-creation.rivet-project";
mkdirSync(dirname(outPath), { recursive: true });
writeSpecCreationProject(outPath, { registry: defaultRegistry() });
console.log(`Written: ${outPath}`);
