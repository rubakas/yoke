import { execFile } from "node:child_process";
import type { ProcessRunner } from "../module/seams.js";

/** Runs a command, capturing exit status without throwing. ok=true iff exit 0. */
export const defaultProcessRunner: ProcessRunner = (cmd, args, cwd) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd, encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout}${stderr}` });
    });
  });
