import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, Plus, Trash2, X, Loader2, Copy, Users, LayoutPanelLeft, Share2, RefreshCw, FileDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categoryIcon, categoryLabel } from "@/lib/categories";
import { downloadPdf } from "@/lib/download";
import { drawHeader, addFootersToAllPages, LM, RM, CONTENT_BOTTOM } from "@/lib/pdfHelpers";

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
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [activeTableIdForColumn, setActiveTableIdForColumn] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [deleteRowModal, setDeleteRowModal] = useState<{ tableId: string; rowIdx: number } | null>(null);
  const [deleteTableConfirmId, setDeleteTableConfirmId] = useState<string | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<number>>(new Set());
  // inline-edit state: key = "table-{id}" | "col-{tableId}-{ci}"
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  // ── Copy-to-staff modal state ──────────────────────────────────────────────
  type StaffMember = { id: string; username: string; role: string };
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyStep, setCopyStep] = useState<"select" | "confirm">("select");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    return () => {
      setSplitView(false);
    };
  }, []);

  const ownerId = profile?.parent_id ?? profile?.id ?? "";

  // Open copy modal — load staff list
  const openCopyModal = async () => {
    if (!ownerId) return;
    setLoadingStaff(true);
    setSelectedStaff(new Set());
    setCopyStep("select");
    setShowCopyModal(true);
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, username, role, job_title")
      .eq("parent_id", ownerId)
      .in("role", ["cashier", "manager"]);
    setStaffList(
      (data ?? []).map((s: any) => ({
        id: s.id,
        username: s.username ?? s.id,
        role: s.role === "manager" || s.job_title === "manager" ? "manager" : "cashier",
      }))
    );
    setLoadingStaff(false);
  };

  // Perform the copy — wipe existing tables for selected staff and replace with owner's
  // Uses a SECURITY DEFINER RPC to bypass RLS (works for direct owners AND chain masters)
  const performCopy = async () => {
    if (!profile?.id || selectedStaff.size === 0) return;
    setCopying(true);
    try {
      const ids = Array.from(selectedStaff);
      const tablesPayload = tables.map((t) => ({
        name: t.name,
        columns: t.columns,
        rows: t.rows,
      }));
      const { error } = await (supabase as any).rpc("copy_stock_count_tables_to_staff", {
        p_owner_id: ownerId,
        p_staff_ids: ids,
        p_tables: tablesPayload,
      });
      if (error) throw error;
      toast.success(`Copied ${tables.length} table(s) to ${ids.length} staff member(s)`);
      setShowCopyModal(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to copy tables");
    } finally {
      setCopying(false);
    }
  };

  const loadTables = async (signal?: { cancelled: boolean }) => {
    if (!profile?.id) return;
    setLoading(true);
    (supabase as any)
      .from("stock_count_tables")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        if (signal?.cancelled) return;
        const loaded = (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name,
          columns: Array.isArray(row.columns) ? row.columns : [],
          rows: Array.isArray(row.rows) ? row.rows : [],
        }));
        setTables(loaded);
        setLoading(false);
      });
  };

  useEffect(() => {
    const signal = { cancelled: false };
    loadTables(signal);
    return () => { signal.cancelled = true; };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`stock-count-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stock_count_tables",
          filter: `profile_id=eq.${profile.id}`,
        },
        () => {
          loadTables();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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

  const MAX_COLUMNS = 10;

  const addColumn = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (table && table.columns.length >= MAX_COLUMNS) {
      toast.error(`Max ${MAX_COLUMNS} columns allowed per table`);
      return;
    }
    setActiveTableIdForColumn(tableId);
    setColumnName("");
    setShowAddColumnModal(true);
  };

  const handleAddColumnConfirm = () => {
    if (!columnName.trim() || !activeTableIdForColumn) return;
    const table = tables.find((t) => t.id === activeTableIdForColumn);
    if (table && table.columns.length >= MAX_COLUMNS) {
      toast.error(`Max ${MAX_COLUMNS} columns allowed per table`);
      setShowAddColumnModal(false);
      setColumnName("");
      setActiveTableIdForColumn(null);
      return;
    }
    persist(
      tables.map((t) => {
        if (t.id !== activeTableIdForColumn) return t;
        return {
          ...t,
          columns: [...t.columns, columnName.trim()],
          rows: t.rows.map((r) => [...r, ""]),
        };
      }),
    );
    setShowAddColumnModal(false);
    setColumnName("");
    setActiveTableIdForColumn(null);
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

  const updateTableName = (tableId: string, name: string) => {
    persist(tables.map((t) => t.id !== tableId ? t : { ...t, name }));
  };

  const updateColumnName = (tableId: string, colIdx: number, name: string) => {
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        const newColumns = [...t.columns];
        newColumns[colIdx] = name;
        return { ...t, columns: newColumns };
      }),
    );
  };

  const deleteRow = (tableId: string, rowIdx: number) => {
    setDeleteRowModal({ tableId, rowIdx });
    setSelectedCols(new Set());
  };

  const confirmDeleteColumns = () => {
    if (!deleteRowModal) return;
    const { tableId, rowIdx } = deleteRowModal;
    const colsToDelete = Array.from(selectedCols).sort((a, b) => b - a);

    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        const newColumns = [...t.columns];
        const newRows = t.rows.map((row) => {
          const newRow = [...row];
          colsToDelete.forEach((ci) => {
            newRow.splice(ci + 1, 1);
          });
          return newRow;
        });
        colsToDelete.forEach((ci) => {
          newColumns.splice(ci, 1);
        });
        const filteredRows = newColumns.length === 0 ? [] : newRows;
        return {
          ...t,
          columns: newColumns,
          rows: filteredRows,
        };
      }),
    );
    setDeleteRowModal(null);
    setSelectedCols(new Set());
  };

  const deleteEntireRow = () => {
    if (!deleteRowModal) return;
    const { tableId, rowIdx } = deleteRowModal;
    persist(
      tables.map((t) => {
        if (t.id !== tableId) return t;
        return { ...t, rows: t.rows.filter((_, i) => i !== rowIdx) };
      }),
    );
    setDeleteRowModal(null);
    setSelectedCols(new Set());
  };

  const calcTotal = (row: string[]) => {
    const sum = row.slice(1).reduce((acc, val) => {
      const n = parseFloat(val);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    return sum > 0 ? String(sum) : "";
  };

  const [pdfBusyTableId, setPdfBusyTableId] = useState<string | null>(null);

  const generateTablePdf = async (table: Table) => {
    if (pdfBusyTableId) return;
    setPdfBusyTableId(table.id);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB");
      const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const title = `Stock Count — ${table.name}`;
      let y = await drawHeader(
        doc,
        profile?.username ?? "Stock Count",
        title,
        dateStr,
        `${dateStr} ${timeStr}`,
      );

      const HEADER_H = 14;  // header row height — tall enough for 2-line wrapped titles
      const ROW_H    = 8;   // data row height
      const TEXT_PAD = 2;   // padding inside cell from top

      // Page content width = 180mm (LM=15, RM=195)
      const CONTENT_W = RM - LM;
      const NUM_COLS  = table.columns.length;
      const COL_TOTAL_W = 22;
      const COL_DATA_W  = NUM_COLS > 0
        ? Math.min(28, Math.floor((CONTENT_W * 0.55) / NUM_COLS))
        : 28;
      const COL_NAME_W  = CONTENT_W - NUM_COLS * COL_DATA_W - COL_TOTAL_W;

      // Absolute left-edge x of every column
      const xName  = LM;
      const xCols  = Array.from({ length: NUM_COLS }, (_, i) => LM + COL_NAME_W + i * COL_DATA_W);
      const xTotal = LM + COL_NAME_W + NUM_COLS * COL_DATA_W;

      // Draw a single cell rect + wrapped text helper
      const cell = (
        cx: number, cy: number, cw: number, ch: number,
        text: string,
        opts: { bold?: boolean; align?: "left" | "center" | "right"; orange?: boolean; size?: number } = {}
      ) => {
        // Border
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(cx, cy, cw, ch);

        if (!text) return;
        doc.setFont("helvetica", opts.bold ? "bold" : "normal");
        const fontSize = opts.size ?? 7.5;
        doc.setFontSize(fontSize);
        doc.setTextColor(...(opts.orange ? ([232, 146, 42] as [number, number, number]) : ([0, 0, 0] as [number, number, number])));

        const lines = doc.splitTextToSize(text, cw - TEXT_PAD * 2) as string[];
        const lineH = fontSize * 0.4; // mm per line at this font size
        const blockH = lines.length * lineH;
        const startY = cy + (ch - blockH) / 2 + lineH * 0.85; // vertically centre the block

        if (opts.align === "center") {
          lines.forEach((line, i) => {
            doc.text(line, cx + cw / 2, startY + i * lineH, { align: "center" });
          });
        } else if (opts.align === "right") {
          lines.forEach((line, i) => {
            doc.text(line, cx + cw - TEXT_PAD, startY + i * lineH, { align: "right" });
          });
        } else {
          lines.forEach((line, i) => {
            doc.text(line, cx + TEXT_PAD, startY + i * lineH);
          });
        }
        doc.setTextColor(0, 0, 0);
      };

      const checkPage = (neededH: number) => {
        if (y + neededH > CONTENT_BOTTOM) {
          doc.addPage();
          y = 20;
        }
      };

      // ── Header row ────────────────────────────────────────────────────
      checkPage(HEADER_H);
      // Shade header background (light grey)
      doc.setFillColor(240, 240, 240);
      doc.rect(LM, y, CONTENT_W, HEADER_H, "F");

      cell(xName,  y, COL_NAME_W,  HEADER_H, "Item name", { bold: true, align: "left",  size: 8 });
      for (let i = 0; i < NUM_COLS; i++) {
        cell(xCols[i], y, COL_DATA_W, HEADER_H, table.columns[i], { bold: true, align: "center", size: 8 });
      }
      cell(xTotal, y, COL_TOTAL_W, HEADER_H, "Total", { bold: true, align: "center", size: 8 });
      y += HEADER_H;

      // ── Data rows ─────────────────────────────────────────────────────
      for (const row of table.rows) {
        checkPage(ROW_H);

        const name = row[0] ?? "";
        cell(xName, y, COL_NAME_W, ROW_H, name, { align: "left" });

        for (let i = 0; i < NUM_COLS; i++) {
          const val  = row[i + 1] ?? "";
          const num  = parseFloat(val);
          const display = val === "" ? "" : isNaN(num) ? val : num.toString();
          cell(xCols[i], y, COL_DATA_W, ROW_H, display, { align: "center" });
        }

        const total = calcTotal(row);
        cell(xTotal, y, COL_TOTAL_W, ROW_H, total, { bold: true, align: "center", orange: !!total });

        y += ROW_H;
      }

      // Empty-table placeholder row
      if (table.rows.length === 0) {
        checkPage(ROW_H);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(LM, y, CONTENT_W, ROW_H);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text("No rows", LM + CONTENT_W / 2, y + ROW_H / 2 + 1, { align: "center" });
        doc.setTextColor(0, 0, 0);
        y += ROW_H;
      }

      addFootersToAllPages(doc);
      const filename = `stock-count-${table.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}-${dateStr.replace(/\//g, "-")}.pdf`;
      await downloadPdf(filename, doc.output("datauristring"));
      toast.success("PDF exported — check your downloads");
    } catch (e: any) {
      toast.error("PDF failed: " + (e?.message ?? "unknown"));
    } finally {
      setPdfBusyTableId(null);
    }
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
    <div className={splitView ? "fixed inset-0 z-30 bg-background pt-14" : ""}>
      {splitView && (
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-black">Stock Count — Split View</h1>
            <p className="text-[10px] text-muted-foreground md:hidden">← Swipe to switch panels →</p>
          </div>
          <button
            onClick={() => setSplitView(false)}
            className="h-8 px-3 rounded-lg text-xs font-black border border-border bg-muted hover:bg-muted/70 transition"
          >
            Close Split
          </button>
        </div>
      )}
      <div className={splitView
        ? "flex flex-row h-[calc(100vh-52px)] overflow-x-auto snap-x snap-mandatory md:overflow-x-visible"
        : "space-y-5"}>
        {/* Left Panel: Stock Count */}
        <div className={splitView
          ? "w-[100vw] md:w-1/2 shrink-0 snap-start overflow-y-auto px-2 md:px-0"
          : ""}>
          <div className="flex items-center gap-2 mt-4">
            <input
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="New table name..."
              className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={createTable}
              disabled={!newTableName.trim()}
              className="h-10 px-3 rounded-xl font-black text-xs sm:text-sm text-primary-foreground transition active:scale-95 disabled:opacity-40 shrink-0"
              style={{ background: "var(--gradient-hero)" }}
            >
              Create Table
            </button>
            {!splitView && profile?.role === "owner" && tables.length > 0 && (
              <button
                onClick={openCopyModal}
                className="h-10 w-10 rounded-xl flex items-center justify-center border border-border bg-muted hover:bg-muted/70 transition active:scale-95 shrink-0"
                title="Copy tables to staff"
              >
                <Share2 className="h-4 w-4" style={{ color: "var(--primary)" }} />
              </button>
            )}
            {!splitView && (
              <button
                onClick={() => setSplitView(true)}
                className="h-10 px-3 rounded-xl font-black text-xs sm:text-sm border border-border bg-muted hover:bg-muted/70 transition active:scale-95 flex items-center gap-2 shrink-0"
              >
                <LayoutPanelLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Split View</span>
              </button>
            )}
           </div>

      <div className="space-y-6 mt-4 pb-24">
        {tables.map((table) => (
          <div key={table.id} className="rounded-2xl border border-border overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border/50"
              style={{ background: "var(--gradient-card)" }}
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" style={{ color: "var(--primary)" }} />
                {editingKey === `table-${table.id}` ? (
                  <input
                    autoFocus
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    onBlur={() => {
                      if (editingDraft.trim()) updateTableName(table.id, editingDraft.trim());
                      setEditingKey(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                      if (e.key === "Escape") { setEditingKey(null); }
                    }}
                    className="h-7 px-2 rounded-lg border border-primary bg-background text-sm font-black outline-none focus:ring-1 focus:ring-primary w-40"
                  />
                ) : (
                  <>
                    <span className="font-black text-sm">{table.name}</span>
                    <button
                      onClick={() => { setEditingDraft(table.name); setEditingKey(`table-${table.id}`); }}
                      className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted/50 transition active:scale-95"
                      title="Rename table"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generateTablePdf(table)}
                  disabled={pdfBusyTableId === table.id}
                  className="h-8 px-3 rounded-lg text-[10px] font-black border border-border hover:bg-muted/50 transition active:scale-95 disabled:opacity-50 flex items-center gap-1"
                  title="Export table as PDF"
                >
                  {pdfBusyTableId === table.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">PDF</span>
                </button>
                <button
                  onClick={() => addColumn(table.id)}
                  disabled={table.columns.length >= 10}
                  className="h-8 px-3 rounded-lg text-[10px] font-black border border-border hover:bg-muted/50 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={table.columns.length >= 10 ? "Max 10 columns reached" : "Add column"}
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
                  onClick={() => setDeleteTableConfirmId(table.id)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition active:scale-95"
                  title="Delete table"
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
                        {editingKey === `col-${table.id}-${ci}` ? (
                          <input
                            autoFocus
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            onBlur={() => {
                              if (editingDraft.trim()) updateColumnName(table.id, ci, editingDraft.trim());
                              setEditingKey(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                              if (e.key === "Escape") { setEditingKey(null); }
                            }}
                            className="w-full h-6 px-1 rounded border border-primary bg-background text-[10px] font-black text-center outline-none focus:ring-1 focus:ring-primary uppercase"
                          />
                        ) : (
                          <span className="inline-flex items-center justify-center gap-1">
                            {col}
                            <button
                              onClick={() => { setEditingDraft(col); setEditingKey(`col-${table.id}-${ci}`); }}
                              className="h-4 w-4 rounded flex items-center justify-center text-muted-foreground/50 hover:text-primary transition active:scale-95"
                              title="Rename column"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        )}
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
                          onClick={() => setDeleteRowModal({ tableId: table.id, rowIdx: ri })}
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
            <button
              onClick={() => loadTables()}
              className="mt-4 h-9 px-4 rounded-lg text-xs font-black border border-border hover:bg-muted/50 transition active:scale-95 inline-flex items-center gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        )}
      </div>
      </div>

      {/* -- Right Panel: Split View ----------------------------------- */}
      {splitView && (
        <div className="w-[100vw] md:w-1/2 shrink-0 snap-start border-l border-border overflow-y-auto px-2 md:px-0">
          <RightPanel
            role={profile?.role}
            jobTitle={(profile as any)?.job_title}
            ownerId={ownerId}
          />
        </div>
      )}
    </div>

      {/* ── Copy-to-Staff Modal ──────────────────────────────────────────── */}
      {showCopyModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => { if (!copying) setShowCopyModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
            style={{ background: "var(--gradient-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {copyStep === "select" ? (
              <>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-black">Copy Tables to Staff</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select staff to receive a copy of your {tables.length} table(s).
                      Their existing tables will be replaced.
                    </p>
                  </div>
                  <button onClick={() => setShowCopyModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-muted ml-3 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-5 pb-2 max-h-64 overflow-y-auto space-y-2">
                  {loadingStaff ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : staffList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No cashiers or managers found.</p>
                  ) : (
                    staffList.map((s) => (
                      <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition">
                        <input
                          type="checkbox"
                          checked={selectedStaff.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selectedStaff);
                            if (e.target.checked) next.add(s.id); else next.delete(s.id);
                            setSelectedStaff(next);
                          }}
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{s.username}</p>
                          <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3">
                  <button onClick={() => setShowCopyModal(false)} className="h-11 rounded-2xl font-black text-sm border border-border transition active:scale-95">Cancel</button>
                  <button
                    onClick={() => setCopyStep("confirm")}
                    disabled={selectedStaff.size === 0}
                    className="h-11 rounded-2xl font-black text-sm text-primary-foreground flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Share2 className="h-4 w-4" />
                    Copy to Staff ({selectedStaff.size})
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 pt-5 pb-3">
                  <h2 className="text-base font-black">Confirm Copy</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will <span className="text-red-400 font-black">replace all existing tables</span> for the selected staff and create a fresh copy of your {tables.length} table(s).
                  </p>
                </div>
                <div className="px-5 pb-3 space-y-1.5">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Tables to copy</p>
                  {tables.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--primary)" }} />
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-xs text-muted-foreground">({t.columns.length} cols · {t.rows.length} rows)</span>
                    </div>
                  ))}
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mt-3">Recipients</p>
                  {staffList.filter((s) => selectedStaff.has(s.id)).map((s) => (
                    <div key={s.id} className="text-sm font-semibold">{s.username} <span className="text-xs text-muted-foreground capitalize">({s.role})</span></div>
                  ))}
                </div>
                <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-3">
                  <button onClick={() => setCopyStep("select")} className="h-11 rounded-2xl font-black text-sm border border-border transition active:scale-95">← Back</button>
                  <button
                    onClick={performCopy}
                    disabled={copying}
                    className="h-11 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Share2 className="h-4 w-4" /> Confirm Copy</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      <Dialog open={showAddColumnModal} onOpenChange={setShowAddColumnModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                Column Title
              </Label>
              <input
                type="text"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumnConfirm();
                }}
                placeholder="Enter column name..."
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddColumnModal(false)}
                className="flex-1 h-11 font-black text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddColumnConfirm}
                disabled={!columnName.trim()}
                className="flex-1 h-11 font-black text-sm"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                Add Column
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Columns Modal */}
      {deleteRowModal && (() => {
        const table = tables.find((t) => t.id === deleteRowModal.tableId);
        if (!table) return null;
        const row = table.rows[deleteRowModal.rowIdx];
        if (!row) return null;
        const allSelected = selectedCols.size === table.columns.length;
        return (
          <Dialog open={!!deleteRowModal} onOpenChange={(open) => !open && setDeleteRowModal(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete Columns</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">Select columns to remove from this row:</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (allSelected) {
                        setSelectedCols(new Set());
                      } else {
                        setSelectedCols(new Set(table.columns.map((_, ci) => ci)));
                      }
                    }}
                    className="h-9 px-4 rounded-lg text-xs font-black border border-border hover:bg-muted/50 transition"
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selectedCols.size} of {table.columns.length} selected
                  </span>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {table.columns.map((col, ci) => (
                    <label
                      key={ci}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCols.has(ci)}
                        onChange={(e) => {
                          const next = new Set(selectedCols);
                          if (e.target.checked) {
                            next.add(ci);
                          } else {
                            next.delete(ci);
                          }
                          setSelectedCols(next);
                        }}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-semibold">{col}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteRowModal(null)}
                    className="flex-1 h-11 font-black text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmDeleteColumns}
                    disabled={selectedCols.size === 0}
                    className="flex-1 h-11 font-black text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirm Delete
                  </Button>
                </div>

                {/* ── Delete entire row section ── */}
                <div className="border-t border-border/50 pt-3 space-y-2">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                    Or remove this row entirely
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row[0] ? `"${row[0]}"` : "This row"} — all column values will be deleted. This cannot be undone.
                  </p>
                  <Button
                    onClick={deleteEntireRow}
                    className="w-full h-11 font-black text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Entire Row
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
      <Dialog open={!!deleteTableConfirmId} onOpenChange={(open) => !open && setDeleteTableConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this table?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground pt-2">
            This will permanently remove the entire table and all its rows and columns. This action cannot be undone.
          </p>
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteTableConfirmId(null)}
              className="flex-1 h-11 font-black text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deleteTableConfirmId) deleteTable(deleteTableConfirmId);
                setDeleteTableConfirmId(null);
              }}
              className="flex-1 h-11 font-black text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Right Panel for Split View -----------------------------------------------
type RightPanelProps = {
  role?: string;
  jobTitle?: string;
  ownerId?: string;
};

function RightPanel({ role, jobTitle, ownerId }: RightPanelProps) {
  const isManager = role === "manager" || jobTitle === "manager";
  const isOwner = role === "owner";
  const isCashier = role === "cashier";

  if (isManager || isOwner) {
    return <StockCheckPanel ownerId={ownerId} />;
  }
  if (isCashier) {
    return <RegisterPanel />;
  }
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Split view not available for your role.
    </div>
  );
}

// --- Stock Check Panel (Manager / Owner) --------------------------------------
function StockCheckPanel({ ownerId }: { ownerId?: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [actuals, setActuals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (supabase as any)
      .from("products")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data }: any) => {
        if (cancelled) return;
        setProducts(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!ownerId) return;
    (supabase as any)
      .from("stock_check_actuals")
      .select("product_id, actual_qty")
      .eq("owner_id", ownerId)
      .then(({ data }: any) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        (data ?? []).forEach((r: any) => {
          map[r.product_id] = r.actual_qty;
        });
        setActuals(map);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const grouped = CATEGORIES.map((cat) => ({
    cat,
    products: sorted.filter((p) => (p.category || "beers") === cat.value),
  })).filter((g) => g.products.length > 0);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <h2 className="text-sm font-black">Stock Check</h2>
        <p className="text-[10px] text-muted-foreground">{products.length} items</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          grouped.map(({ cat, products }) => (
            <div key={cat.value}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: "var(--primary)" }}>
                {cat.icon} {cat.label}
              </p>
              <div className="space-y-1">
                {products.map((p) => {
                  const actual = actuals[p.id] ?? p.stock_qty;
                  const diff = p.stock_qty - actual;
                  const loss = diff > 0 ? diff * p.price : 0;
                  const gain = diff < 0 ? Math.abs(diff) * p.price : 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2" style={{ background: "var(--gradient-card)" }}>
                      <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground mr-2">Qty: {p.stock_qty ?? 0}</span>
                      <span className="text-[10px] font-black text-primary">Actual: {actual}</span>
                      {loss > 0 && <span className="text-[10px] font-black text-red-400 ml-2">-${loss.toFixed(2)}</span>}
                      {gain > 0 && <span className="text-[10px] font-black text-green-400 ml-2">+${gain.toFixed(2)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
       </div>
    </div>
  );
}

// --- Register Panel (Cashier) -------------------------------------------------
function RegisterPanel() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("beers");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (supabase as any)
      .from("products")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data }: any) => {
        if (cancelled) return;
        setProducts(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = products.filter((p) => (p.category || "beers") === cat);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <h2 className="text-sm font-black">Bar</h2>
        <p className="text-[10px] text-muted-foreground">{products.length} items</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Category tabs */}
        <div className="sticky top-0 z-20 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                className={`h-9 shrink-0 rounded-xl font-black transition flex items-center justify-center px-3 ${
                  cat === c.value ? "text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
                style={cat === c.value ? { background: "var(--gradient-hero)" } : {}}
              >
                <span className="text-xs leading-none whitespace-nowrap">{c.icon} {c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="p-3 pb-24 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 gap-2">
          {loading ? (
            <div className="col-span-full flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground text-xs py-10">
              No items in this category.
            </div>
          ) : (
            filtered.map((p) => {
              const inStock = (p.stock_qty ?? 0) > 0;
              return (
              <div
                key={p.id}
                className="relative rounded-2xl overflow-hidden border flex flex-col items-center justify-center aspect-square"
                style={{
                  background: "var(--gradient-card)",
                  borderColor: inStock ? "rgba(251,146,60,0.8)" : "rgba(255,255,255,0.08)",
                  opacity: inStock ? 1 : 0.35,
                }}
              >
                {/* Qty badge top-left */}
                {inStock && (
                  <div className="absolute top-1.5 left-1.5 h-6 min-w-[1.5rem] px-1.5 rounded-full flex items-center justify-center bg-black/70 shadow z-10">
                    <span className="text-[10px] font-black text-white leading-none">
                      {p.stock_qty}
                    </span>
                  </div>
                )}

                {/* Product image / icon */}
                <div className="aspect-[3/4] relative w-full flex items-center justify-center text-4xl">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-4xl">{categoryIcon(p.category ?? "drinks")}</span>
                  )}
                </div>

                {/* Name + price */}
                <div className="px-2 py-1.5 w-full text-center">
                  <p className="text-[11px] font-bold leading-tight truncate">{p.name}</p>
                  <p className="text-[10px] font-black text-primary">${Number(p.price).toFixed(2)}</p>
                </div>
              </div>
              );
            })
          )}
        </div>
       </div>
     </div>
   );
 }
