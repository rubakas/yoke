// FR-003: create the better-sqlite3 connection and Drizzle instance.

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { loadConfig } from "../config.js";

const config = loadConfig();
const sqlite = new Database(config.dbPath);

export const db = drizzle(sqlite, { schema });
