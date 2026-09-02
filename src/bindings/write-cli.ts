#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPipelines, loadPipeline } from "../canon/load.js";
import { generateWorkflowScript } from "./claudeCode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");

const pipelinesDir = join(repoRoot, "pipelines");
const outDir = join(repoRoot, ".claude", "workflows");

mkdirSync(outDir, { recursive: true });

const yamlFiles = listPipelines(pipelinesDir);
for (const yamlFile of yamlFiles) {
  const loaded = loadPipeline(yamlFile);
  const script = generateWorkflowScript(loaded);
  const outFile = join(outDir, `${loaded.def.id}.js`);
  writeFileSync(outFile, script);
  console.log(`Written: ${outFile}`);
}
