#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPipelines, loadPipeline } from "../canon/load.js";
import { getActiveProfile } from "../canon/registry.js";
import { generateWorkflowScript } from "./claudeCode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");

const pipelinesDir = join(repoRoot, "pipelines");
const outDir = join(repoRoot, ".claude", "workflows");

mkdirSync(outDir, { recursive: true });

const profile = getActiveProfile();
const yamlFiles = listPipelines(pipelinesDir);
for (const yamlFile of yamlFiles) {
  const loaded = loadPipeline(yamlFile);
  const script = generateWorkflowScript(loaded, profile);
  const outFile = join(outDir, `${loaded.def.id}.js`);
  writeFileSync(outFile, script);
  console.log(`Written: ${outFile}`);
}
