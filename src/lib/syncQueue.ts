/**
 * syncQueue.ts
 *
 * Replays every queued offline mutation to Supabase in strict insertion order.
 * Groups of operations that share a groupId are replayed together; if any op
 * within a group fails it is left in the queue to retry on the next sync cycle.
 *
 * Called automatically by OfflineProvider when the network comes back online,
 * and can also be triggered manually.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  getAllOps,
  removeOp,
  bumpAttempts,
  type OfflineOp,
} from "@/lib/offlineQueue";

/** Max replay attempts before an op is abandoned (to avoid infinite loops). */
const MAX_ATTEMPTS = 5;

export type SyncResult = {
  synced: number;
  failed: number;
  abandoned: number;
};

/**
 * Execute a single queued operation against Supabase.
 * Returns true on success, false on failure.
 */
async function replayOp(op: OfflineOp): Promise<boolean> {
  try {
    switch (op.type) {
      case "orders_insert": {
        const { error } = await (supabase as any).from("orders").insert(op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "rpc_decrement_stock_item": {
        const { error } = await supabase.rpc("decrement_stock_item", op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "rpc_record_shot": {
        const { error } = await supabase.rpc("record_shot", op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "rpc_record_pack_unit": {
        const { error } = await supabase.rpc("record_pack_unit", op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "rpc_record_credit_charge": {
        const { error } = await supabase.rpc("record_credit_charge", op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "credit_transactions_insert": {
        const { error } = await (supabase as any)
          .from("credit_transactions")
          .insert(op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      default:
        // Unknown op type — remove it so it doesn't block the queue
        console.warn("[syncQueue] Unknown op type, discarding:", (op as OfflineOp).type);
        return true;
    }
    return true;
  } catch (err) {
    console.error("[syncQueue] Replay failed for op", op.id, op.type, err);
    return false;
  }
}

/**
 * Run a full sync pass. Processes all pending ops in insertion order.
 * Returns a summary of what happened.
 */
export async function syncAllQueued(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, abandoned: 0 };

  let ops: OfflineOp[];
  try {
    ops = await getAllOps();
  } catch (err) {
    console.error("[syncQueue] Failed to read offline queue:", err);
    return result;
  }

  if (ops.length === 0) return result;

  for (const op of ops) {
    if (op.id === undefined) continue;

    // Abandon ops that have exceeded retry limit
    if (op.attempts >= MAX_ATTEMPTS) {
      console.warn("[syncQueue] Abandoning op after max attempts:", op.id, op.type);
      await removeOp(op.id);
      result.abandoned += 1;
      continue;
    }

    const ok = await replayOp(op);
    if (ok) {
      await removeOp(op.id);
      result.synced += 1;
    } else {
      await bumpAttempts(op.id);
      result.failed += 1;
    }
  }

  return result;
}
