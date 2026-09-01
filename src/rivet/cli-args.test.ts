import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs } from "./cli-args.js";

describe("parseArgs", () => {
  it("returns defaults when no args", () => {
    const args = parseArgs([], {});
    assert.equal(args.db, "./yoke.sqlite");
    assert.equal(args.project, "rivet/spec-creation.rivet-project");
    assert.equal(args.port, 21888);
    assert.equal(args.waitForEditor, false);
    assert.equal(args.noRun, false);
    assert.equal(args.request, undefined);
    assert.equal(args.requestFile, undefined);
  });

  it("uses YOKE_DB_PATH from env as default db", () => {
    const args = parseArgs([], { YOKE_DB_PATH: "/tmp/test.sqlite" });
    assert.equal(args.db, "/tmp/test.sqlite");
  });

  it("--db overrides env", () => {
    const args = parseArgs(["--db", "/custom.sqlite"], { YOKE_DB_PATH: "/env.sqlite" });
    assert.equal(args.db, "/custom.sqlite");
  });

  it("--request sets request text", () => {
    const args = parseArgs(["--request", "Add CSV export"], {});
    assert.equal(args.request, "Add CSV export");
  });

  it("-r is an alias for --request", () => {
    const args = parseArgs(["-r", "Short request"], {});
    assert.equal(args.request, "Short request");
  });

  it("--request-file sets requestFile", () => {
    const args = parseArgs(["--request-file", "/tmp/req.txt"], {});
    assert.equal(args.requestFile, "/tmp/req.txt");
  });

  it("--project sets project path", () => {
    const args = parseArgs(["--project", "my.rivet-project"], {});
    assert.equal(args.project, "my.rivet-project");
  });

  it("--port sets port number", () => {
    const args = parseArgs(["--port", "9999"], {});
    assert.equal(args.port, 9999);
  });

  it("--wait-for-editor sets waitForEditor", () => {
    const args = parseArgs(["--wait-for-editor"], {});
    assert.equal(args.waitForEditor, true);
  });

  it("--no-run sets noRun", () => {
    const args = parseArgs(["--no-run"], {});
    assert.equal(args.noRun, true);
  });

  it("parses multiple flags together", () => {
    const args = parseArgs(
      ["--request", "My feature", "--db", "/app.sqlite", "--port", "12345", "--wait-for-editor"],
      {}
    );
    assert.equal(args.request, "My feature");
    assert.equal(args.db, "/app.sqlite");
    assert.equal(args.port, 12345);
    assert.equal(args.waitForEditor, true);
  });
});
