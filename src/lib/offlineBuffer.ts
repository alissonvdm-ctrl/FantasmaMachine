import type { UpsertItemInput } from "@/domain/types";

const DB_NAME = "reposicao-vending-offline";
const STORE_NAME = "itens_pendentes";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ["visitaId", "molaId"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Grava (ou substitui) um item pendente. Chamado quando o POST direto falha. */
export async function enqueueItem(item: UpsertItemInput): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingItems(): Promise<UpsertItemInput[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as UpsertItemInput[]);
    request.onerror = () => reject(request.error);
  });
}

export async function removeItem(visitaId: string, molaId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete([visitaId, molaId]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface FlushResult {
  enviados: number;
  restantes: number;
}

/**
 * Reenvia a fila local ao restabelecer conexão (AT-009). `send` deve devolver
 * `true` somente quando o servidor confirmou o registro; o item só sai da fila
 * nesse caso, então uma queda no meio do reenvio não perde dado.
 */
export async function flushPendingItems(
  send: (item: UpsertItemInput) => Promise<boolean>,
): Promise<FlushResult> {
  const pendentes = await listPendingItems();
  let enviados = 0;
  for (const item of pendentes) {
    const ok = await send(item);
    if (ok) {
      await removeItem(item.visitaId, item.molaId);
      enviados += 1;
    }
  }
  const restantes = (await listPendingItems()).length;
  return { enviados, restantes };
}
