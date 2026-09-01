// Serialize the spec-creation project to disk.

import { writeFileSync } from "node:fs";
import { serializeProject } from "@ironclad/rivet-node";
import { buildSpecCreationProject, type BuildOptions } from "./build.js";

export function writeSpecCreationProject(path: string, opts: BuildOptions): void {
  const project = buildSpecCreationProject(opts);
  const yaml = serializeProject(project) as string;
  writeFileSync(path, yaml, "utf-8");
}
