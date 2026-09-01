// NoopTracker — reference swap example (FR-004, spec 003).
// Useful for testing and environments without a real issue tracker.

import type { TrackerProvider, TrackerPayload, TrackerUpdate } from "../module/seams.js";

const DEFAULT_PAYLOAD: TrackerPayload = {
  title: "",
  body: "",
  labels: [],
  url: "",
};

export class NoopTracker implements TrackerProvider {
  private readonly payload: TrackerPayload;

  constructor(opts?: { fixture?: TrackerPayload }) {
    this.payload = opts?.fixture ?? DEFAULT_PAYLOAD;
  }

  ingest(_ref: string): Promise<TrackerPayload> {
    return Promise.resolve(this.payload);
  }

  syncBack(_ref: string, _update: TrackerUpdate): Promise<void> {
    return Promise.resolve();
  }
}
