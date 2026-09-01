// Store module descriptors — registered under the "ticketStore" seam (FR-003).

import { makeDb } from "../db/index.js";
import { DrizzleTicketStore } from "./sqlite.js";
import type { TicketStore } from "../module/seams.js";
import type { Module } from "../module/types.js";

export const storeModules: Module<TicketStore>[] = [
  {
    id: "sqlite",
    seam: "ticketStore",
    create: (cfg) => {
      const dbPath = (cfg?.dbPath as string | undefined) ?? "./yoke.sqlite";
      return new DrizzleTicketStore(makeDb(dbPath));
    },
  },
];
