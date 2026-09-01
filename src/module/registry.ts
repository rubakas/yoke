// Registry — typed seam resolver.  No external DI lib.

import type { Module, Manifest, SeamName } from "./types.js";

export class Registry {
  /** All registered modules, keyed by seam. */
  private readonly modules = new Map<SeamName, Module[]>();
  /** Active module id per seam. */
  private readonly active = new Map<SeamName, string>();

  /**
   * Register a module and make it the active implementation for its seam.
   * Last call for a given seam wins.
   */
  register(module: Module): void {
    const list = this.modules.get(module.seam) ?? [];
    // Replace existing entry with same id, or append.
    const idx = list.findIndex((m) => m.id === module.id);
    if (idx >= 0) {
      list[idx] = module;
    } else {
      list.push(module);
    }
    this.modules.set(module.seam, list);
    this.active.set(module.seam, module.id);
  }

  /**
   * Return all modules registered for a seam.
   */
  list(seam: SeamName): Module[] {
    return this.modules.get(seam) ?? [];
  }

  /**
   * Instantiate and return the active module for a seam.
   * @throws {Error} with the seam name when no active/enabled module exists.
   */
  get<T>(seam: SeamName): T {
    const activeId = this.active.get(seam);
    const list = this.modules.get(seam) ?? [];

    if (!activeId) {
      throw new Error(
        `No module registered for required seam "${seam}". ` +
          `Register a module or add "${seam}" to the manifest.`
      );
    }

    const module = list.find((m) => m.id === activeId);
    if (!module) {
      throw new Error(
        `Active module "${activeId}" for seam "${seam}" is not in the registry. ` +
          `Ensure it is listed under the enabled modules in the manifest.`
      );
    }

    return module.create() as T;
  }

  /**
   * Load a config manifest — register only enabled modules from `available`,
   * then set the active module per seam as declared in the manifest.
   *
   * This replaces any previously registered modules for the affected seams.
   */
  loadManifest(manifest: Manifest, available: Module[]): void {
    const seams = Object.keys(manifest) as SeamName[];

    for (const seam of seams) {
      const entry = manifest[seam];
      if (!entry) continue;

      // Clear existing registrations for this seam.
      this.modules.set(seam, []);
      this.active.delete(seam);

      // Register only enabled modules.
      for (const mod of available) {
        if (mod.seam === seam && entry.enabled.includes(mod.id)) {
          const list = this.modules.get(seam) ?? [];
          list.push(mod);
          this.modules.set(seam, list);
        }
      }

      // Set active — only if the active id is among the enabled modules.
      const list = this.modules.get(seam) ?? [];
      if (list.some((m) => m.id === entry.active)) {
        this.active.set(seam, entry.active);
      }
    }
  }
}
