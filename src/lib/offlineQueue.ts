/**
 * offlineQueue.ts
 *
 * IndexedDB-backed queue for Supabase mutations that need to be replayed
 * when the network is restored. Uses the `idb` wrapper for clean async API.
 *
 * Supported operation types mirror every write done during checkout:
 *   - orders_insert
 *   - rpc_decrement_stock_item
 *   - rpc_record_shot
 *   - rpc_record_pack_unit
 *   - rpc_record_credit_charge
 *   - credit_transactions_insert
 */

import { openDB, type IDBPDatabase } from "idb";

export type OfflineOpType =
  | "orders_insert"
  | "rpc_decrement_stock_item"
  | "rpc_record_shot"
  | "rpc_record_pack_unit"
  | "rpc_record_credit_charge"
  | "credit_transactions_insert";

export interface OfflineOp {
  /** Auto-incremented primary key */
  id?: number;
  type: OfflineOpType;
  /** The full payload to send to Supabase */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  /** ISO timestamp so ops are replayed in insertion order */
  createdAt: string;
  /** How many replay attempts have been made */
  attempts: number;
  /**
   * Group id — all ops from a single checkout share the same groupId
   * so they can be replayed together as an atomic batch.
   */
  groupId: string;
}

const DB_NAME = "bartap-offline";
const STORE = "ops";
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("groupId", "groupId");
      }
    },
  });
  return _db;
}

/** Add one operation to the queue. Returns its assigned id. */
export async function enqueue(
  type: OfflineOpType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  groupId: string
): Promise<number> {
  const db = await getDb();
  const op: OfflineOp = {
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    groupId,
  };
  return db.add(STORE, op) as Promise<number>;
}

/** Return all pending operations in insertion order. */
export async function getAllOps(): Promise<OfflineOp[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(STORE, "createdAt")) as OfflineOp[];
  return all;
}

/** Return total count of queued operations. */
export async function getQueueSize(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

/** Remove a single operation by its id (call after successful replay). */
export async function removeOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

/** Increment the attempts counter on a failed op. */
export async function bumpAttempts(id: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const op = (await tx.store.get(id)) as OfflineOp | undefined;
  if (op) {
    op.attempts += 1;
    await tx.store.put(op);
  }
  await tx.done;
}

/** Wipe the entire queue (e.g. after a full sync). */
export async function clearQueue(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
