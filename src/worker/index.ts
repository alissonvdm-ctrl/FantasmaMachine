import cron from "node-cron";
import { getDb } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { executarSincronizacao } from "@/worker/sync";

const db = getDb();
applyMigrations(db);

logger.info("worker.iniciado", { syncCron: config.syncCron });

cron.schedule(config.syncCron, () => {
  void executarSincronizacao({ db }).then((snapshot) => {
    logger.info("worker.execucao", { snapshotId: snapshot.id, status: snapshot.status });
  });
});
