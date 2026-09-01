// TDD tests for RunControlImpl and RunControlRegistry.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RunControlImpl, RunControlRegistry } from "./control.js";

describe("RunControlImpl", () => {
  describe("checkpoint", () => {
    it("resolves immediately when not paused", async () => {
      const ctrl = new RunControlImpl();
      // Should resolve without hanging
      await ctrl.checkpoint();
    });

    it("does not resolve while paused; resolves after resume()", async () => {
      const ctrl = new RunControlImpl();
      ctrl.pause();

      let resolved = false;
      const p = ctrl.checkpoint().then(() => {
        resolved = true;
      });

      // Yield to the event loop — checkpoint should still be pending
      await Promise.resolve();
      assert.strictEqual(resolved, false, "should still be pending while paused");

      ctrl.resume();
      await p;
      assert.strictEqual(resolved, true, "should resolve after resume");
    });

    it("abort() unblocks a paused checkpoint and sets isAborted true", async () => {
      const ctrl = new RunControlImpl();
      ctrl.pause();

      let resolved = false;
      const p = ctrl.checkpoint().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      assert.strictEqual(resolved, false, "should still be pending while paused");

      ctrl.abort();
      await p;
      assert.strictEqual(resolved, true, "should resolve after abort");
      assert.strictEqual(ctrl.isAborted, true, "isAborted should be true");
    });

    it("resolves immediately when already aborted", async () => {
      const ctrl = new RunControlImpl();
      ctrl.abort();
      // Should not hang
      await ctrl.checkpoint();
      assert.strictEqual(ctrl.isAborted, true);
    });
  });

  describe("state flags", () => {
    it("isPaused reflects pause/resume", () => {
      const ctrl = new RunControlImpl();
      assert.strictEqual(ctrl.isPaused, false);
      ctrl.pause();
      assert.strictEqual(ctrl.isPaused, true);
      ctrl.resume();
      assert.strictEqual(ctrl.isPaused, false);
    });

    it("isAborted starts false and becomes true after abort()", () => {
      const ctrl = new RunControlImpl();
      assert.strictEqual(ctrl.isAborted, false);
      ctrl.abort();
      assert.strictEqual(ctrl.isAborted, true);
    });
  });
});

describe("RunControlRegistry", () => {
  it("get() returns the same instance for the same ticketId", () => {
    const reg = new RunControlRegistry();
    const a = reg.get(1);
    const b = reg.get(1);
    assert.strictEqual(a, b);
  });

  it("get() returns distinct instances for different ticketIds", () => {
    const reg = new RunControlRegistry();
    const a = reg.get(1);
    const b = reg.get(2);
    assert.notStrictEqual(a, b);
  });

  it("steer(pause) pauses the control for that ticket", () => {
    const reg = new RunControlRegistry();
    reg.steer(1, "pause");
    assert.strictEqual(reg.get(1).isPaused, true);
  });

  it("steer(resume) resumes a paused control", () => {
    const reg = new RunControlRegistry();
    reg.steer(1, "pause");
    reg.steer(1, "resume");
    assert.strictEqual(reg.get(1).isPaused, false);
  });

  it("steer(abort) aborts the control for that ticket", () => {
    const reg = new RunControlRegistry();
    reg.steer(1, "abort");
    assert.strictEqual(reg.get(1).isAborted, true);
  });

  it("steer only affects the targeted ticketId", () => {
    const reg = new RunControlRegistry();
    reg.steer(1, "abort");
    assert.strictEqual(reg.get(2).isAborted, false);
  });

  it("list() returns all registered ticketIds", () => {
    const reg = new RunControlRegistry();
    reg.get(10);
    reg.get(20);
    reg.get(30);
    const ids = reg.list();
    assert.deepStrictEqual(ids.sort((a, b) => a - b), [10, 20, 30]);
  });
});
