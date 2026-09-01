// Core types for the module system — seam names, module descriptors, and manifest shape.

/** Union of all pluggable seam names. */
export type SeamName =
  | "tracker"
  | "model"
  | "executor"
  | "stage"
  | "check"
  | "ticketStore"
  | "telemetry";

/**
 * A module descriptor — declares identity, which seam it satisfies,
 * and a factory that instantiates the implementation (optionally accepting config).
 */
export interface Module<T = unknown> {
  /** Unique identifier for this module (e.g. "gh-tracker", "litellm"). */
  id: string;
  /** The seam this module satisfies. */
  seam: SeamName;
  /** Factory — called by the registry to create the implementation instance. */
  create(config?: Record<string, unknown>): T;
}

/**
 * Per-seam manifest entry — declares which module is active and which are enabled.
 * Disabled modules are never loaded by the registry.
 */
export interface ManifestEntry {
  /** ID of the module that should be returned by `get(seam)`. */
  active: string;
  /** IDs of all modules allowed to load for this seam. */
  enabled: string[];
}

/**
 * Config manifest — maps each seam to its active/enabled module selection.
 * Omitting a seam entirely leaves it unmanaged by this manifest.
 */
export type Manifest = Partial<Record<SeamName, ManifestEntry>>;
