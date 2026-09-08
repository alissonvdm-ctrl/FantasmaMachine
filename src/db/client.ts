import { createClient, type Client, type Transaction } from "@libsql/client";
import { config } from "@/lib/config";

/** Repos aceitam Client ou Transaction — ambos expõem o mesmo `execute()`. */
export type DbHandle = Client | Transaction;

let instance: Client | null = null;

export function getDb(): Client {
  if (instance) return instance;

  instance = createClient({
    url: config.databaseUrl,
    authToken: config.databaseAuthToken,
  });
  return instance;
}
