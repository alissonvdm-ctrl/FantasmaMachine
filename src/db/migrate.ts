import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@/db/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function applyMigrations(db: Database.Database): void {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === `file://${entry}`;
}

if (isMainModule()) {
  applyMigrations(getDb());
  console.log("Migrations aplicadas.");
}
