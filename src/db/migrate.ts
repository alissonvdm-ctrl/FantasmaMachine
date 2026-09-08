import type { DbHandle } from "@/db/client";
import { getDb } from "@/db/client";
import { schemaSql } from "@/db/schema";

export async function applyMigrations(db: DbHandle): Promise<void> {
  await db.executeMultiple(schemaSql);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === `file://${entry}`;
}

if (isMainModule()) {
  await applyMigrations(getDb());
  console.log("Migrations aplicadas.");
}
