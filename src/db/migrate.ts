import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbHandle } from "@/db/client";
import { getDb } from "@/db/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function applyMigrations(db: DbHandle): Promise<void> {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  await db.executeMultiple(schema);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === `file://${entry}`;
}

if (isMainModule()) {
  await applyMigrations(getDb());
  console.log("Migrations aplicadas.");
}
