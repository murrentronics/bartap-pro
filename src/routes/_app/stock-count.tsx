import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Plus, Trash2, X, Loader2, Copy, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/stock-count")({
  component: StockCountPage,
});

export default StockCountPage;

type Table = {
  id: string;
  name: string;
  columns: string[];
  rows: string[][];
};

function StockCountPage() {
  const { profile } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [newTableName, setNewTableName] = useState("");
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  const ownerId = profile?.parent_id ?? profile?.id ?? "";

  const copyToStaff = async () => {
    if (!profile?.id || !ownerId) return;
    setCopying(true);
    try {
      // Get owner's tables
      const { data: ownerTables, error: ownerError } = await (supabase as any)
        .from("stock_count_tables")
        .select("*")
        .eq("profile_id", profile.id);

      if (ownerError) throw ownerError;
      if (!ownerTables || ownerTables.length === 0) {
        toast.error("You have no stock count tables to copy");
        setCopying(false);
        return;
      }

      // Get all cashiers/managers under this owner
      const { data: staff, error: staffError } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("parent_id", ownerId)
        .in("role", ["cashier", "manager"]);

      if (staffError) throw staffError;
      if (!staff || staff.length === 0) {
        toast.error("No cashiers or managers found to copy to");
        setCopying(false);
        return;
      }

      // Get staff who already have tables
      const staffIds = staff.map((s: any) => s.id);
      const { data: existingTables, error: existingError } = await (supabase as any)
        .from("stock_count_tables")
        .select("profile_id")
        .in("profile_id", staffIds);

      if (existingError) throw existingError;
      const staffWithTables = new Set((existingTables ?? []).map((t: any) => t.profile_id));

      // Filter to only staff without tables
      const staffWithoutTables = staff.filter((s: any) => !staffWithTables.has(s.id));
      if (staffWithoutTables.length === 0) {
        toast.success("All staff already have stock count tables");
        setCopying(false);
        return;
      }

      // Copy tables to each staff member without tables
      const copies = [];
      for (const staffMember of staffWithoutTables) {
        for (const table of ownerTables) {
          copies.push({
            id: crypto.randomUUID(),
            profile_id: staffMember.id,
            owner_id: ownerId,
            name: table.name,
            columns: table.columns,
            rows: table.rows,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      const { error: insertError } = await (supabase as any)
        .from("stock_count_tables")
        .insert(copies);

      if (insertError) throw insertError;
      toast.success(`Copied ${ownerTables.length} table(s) to ${staffWithoutTables.length} staff member(s)`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to copy tables");
    } finally {
      setCopying(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("stock_count_tables")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loaded = (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name,
          columns: Array.isArray(row.columns) ? row.columns : [],
          rows: Array.isArray(row.rows) ? row.rows : [],
        }));
        setTables(loaded);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const persistToDb = async (next: Table[]) => {
    if (!profile?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("stock_count_tables").upsert(
      next.map((t) => ({
        id: t.id,
        profile_id: profile.id,
        owner_id: ownerId,
        name: t.name,
        columns: t.columns,
        rows: t.rows,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
    if (error) {
      console.error("Failed to save stock count table:", error);
    }
  };

  const persist = (next: Table[]) => {
    setTables(next);
    persistToDb(next);
  };

  const createTable = () => {
    if (!newTableName.trim()) return;
    const t: Table = {
      id: crypto.randomUUID(),
      name: newTableName.trim(),
      columns: [],
      rows: [],
    };
    persist([...tables, t]);
    setNewTableName("");
  };

  const deleteTable = async (id: string) => {
    const next = tables.filter((t) => t.id !== id);
    persist(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("stock_count_tables").delete().eq("id", id);
  };

  const addRow = (tableId: string) => {
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          rows: [...t.rows, Array(t.columns.length + 1).fill("")],
        };
      }),
    );
  };

  const addColumn = (tableId: string) => {
    const name = prompt("Column title:");
    if (!name?.trim()) return;
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: [...t.columns, name.trim()],
          rows: t.rows.map((r) => [...r, ""]),
        };
      }),
    );
  };

  const updateCell = (tableId: string, rowIdx: number, colIdx: number, val: string) => {
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        const newRows = [...t.rows];
        newRows[rowIdx] = [...newRows[rowIdx]];
        newRows[rowIdx][colIdx] = val;
        return { ...t, rows: newRows };
      }),
    );
  };

  const deleteRow = (tableId: string, rowIdx: number) => {
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          rows: t.rows.filter((_, i) => i !== rowIdx),
        };
      }),
    );
  };

  const calcTotal = (row: string[]) => {
    const sum = row.slice(1).reduce((acc, val) => {
      const n = parseFloat(val);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    return sum > 0 ? String(sum) : "";
  };

  const isCashier = profile?.role === "cashier";
  const isManager = profile?.role === "manager" || (profile as any)?.job_title === "manager";
  const isOwner = profile?.role === "owner";

  if (!isCashier && !isManager && !isOwner) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Stock Count is available for owners, managers and cashiers.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black leading-tight">Stock Count</h1>
            <p className="text-xs text-muted-foreground">
              Personal stock count sheets — does not affect system stock
            </p>
          </div>
          {profile?.role === "owner" && (
            <button
              onClick={copyToStaff}
              disabled={copying}
              className="h-9 px-3 rounded-xl font-black text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-40"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            >
              {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              {copying ? "Copying…" : "Copy To Staff"}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value)}
          placeholder="New table name..."
          className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={createTable}
          disabled={!newTableName.trim()}
          className="h-10 px-4 rounded-xl font-black text-sm text-primary-foreground transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--gradient-hero)" }}
        >
          Create Table
        </button>
      </div>

      <div className="space-y-6">
        {tables.map((table) => (
          <div key={table.id} className="rounded-2xl border border-border overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border/50"
              style={{ background: "var(--gradient-card)" }}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" style={{ color: "var(--primary)" }} />
                <span className="font-black text-sm">{table.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addColumn(table.id)}
                  className="h-8 px-3 rounded-lg text-[10px] font-black border border-border hover:bg-muted/50 transition active:scale-95"
                >
                  + Add Column
                </button>
                <button
                  onClick={() => addRow(table.id)}
                  className="h-8 px-3 rounded-lg text-[10px] font-black border border-primary/40 text-primary hover:bg-primary/10 transition active:scale-95"
                >
                  + Add Row
                </button>
                <button
                  onClick={() => deleteTable(table.id)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "max-content" }}>
                <thead>
                  <tr
                    className="border-b border-border/40"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[200px]">
                      Item name
                    </th>
                    {table.columns.map((col, ci) => (
                      <th
                        key={ci}
                        className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[90px] min-w-[90px]"
                      >
                        {col}
                      </th>
                    ))}
                    <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground min-w-[80px]">
                      Total
                    </th>
                    <th className="w-[40px] min-w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-border/20">
                      <td className="px-2 py-1 min-w-[200px]">
                        <input
                          type="text"
                          value={row[0] ?? ""}
                          onChange={(e) => updateCell(table.id, ri, 0, e.target.value)}
                          onFocus={() => setActiveCell(`${table.id}-${ri}-0`)}
                          onBlur={() => setActiveCell(null)}
                          placeholder="Item"
                          className="w-full h-9 px-2 rounded-lg border border-transparent bg-transparent text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background"
                        />
                      </td>
                      {table.columns.map((_, ci) => {
                        const val = row[ci + 1] ?? "";
                        return (
                          <td key={ci} className="px-2 py-1 w-[90px] min-w-[90px]">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, "");
                                updateCell(table.id, ri, ci + 1, v);
                              }}
                              onFocus={() => setActiveCell(`${table.id}-${ri}-${ci + 1}`)}
                              onBlur={() => setActiveCell(null)}
                              placeholder="0"
                              className={`w-full h-9 px-2 rounded-lg border text-xs font-black text-center focus:outline-none focus:ring-2 focus:ring-primary ${
                                activeCell === `${table.id}-${ri}-${ci + 1}`
                                  ? "border-primary bg-background"
                                  : "border-transparent bg-transparent"
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 w-[80px] min-w-[80px]">
                        <div className="h-9 px-2 flex items-center justify-center rounded-lg bg-muted/20 text-xs font-black text-primary">
                          {calcTotal(row)}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-center w-[40px] min-w-[40px]">
                        <button
                          onClick={() => deleteRow(table.id, ri)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition active:scale-95"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {table.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={table.columns.length + 3}
                        className="px-4 py-8 text-center text-muted-foreground text-xs"
                      >
                        No rows yet. Tap + Add Row to start counting.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {tables.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">No stock count tables yet</p>
            <p className="text-xs mt-1">Create a table above to start your personal stock count.</p>
          </div>
        )}
      </div>
    </div>
  );
}
