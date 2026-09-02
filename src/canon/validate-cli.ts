import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listPipelines, loadPipeline } from "./load.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");
const pipelinesDir = join(repoRoot, "pipelines");

const files = listPipelines(pipelinesDir);
let hasError = false;

for (const file of files) {
  try {
    const { def } = loadPipeline(file);
    console.log(`${def.id} OK (${def.steps.length} steps)`);
  } catch (e) {
    console.error(`ERROR: ${file}: ${String(e)}`);
    hasError = true;
  }
}

if (hasError) process.exit(1);
