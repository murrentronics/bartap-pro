import { readFileSync, writeFileSync } from 'fs';

const file = 'src/routes/_app/wallet.tsx';
let c = readFileSync(file, 'utf8');

// ── 1. Add cashier_expense to the type filter (4 occurrences) ─────────────────
const OLD_FILTER = `["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge"]`;
const NEW_FILTER = `["transfer_in", "transfer_out", "bottle_finished", "pack_finished", "credit_payment", "credit_charge", "cashier_expense"]`;
c = c.split(OLD_FILTER).join(NEW_FILTER);

// ── 2. Insert tabs + wrap sales section ──────────────────────────────────────
// Find the hero section closing + the old Records section opening
// Use unique strings that will survive CRLF
const HERO_END = `Cashier \u2014 clears to owner`;   // unique in file
const SALES_SECTION_OPEN = `space-y-3">\n        <div className="flex items-center justify-between">\n          <h2 className="font-black text-xl">`;

// Find positions
const heroPos = c.indexOf(HERO_END);
if (heroPos < 0) { console.error('hero not found'); process.exit(1); }

// Find the <section className="space-y-3"> that immediately follows the hero section
// Walk forward from heroPos to find it
const afterHero = c.indexOf('<section', heroPos);
console.log('afterHero section at:', afterHero);
console.log('preview:', c.substring(afterHero, afterHero + 60));

// Find the closing of the sales section (the last PaginationBar inside CashierWallet)
// and the closing </section></div>);} before OwnerStatement
const OWN_STMT_MARKER = `// \u2500\u2500\u2500 Owner Statement Modal`;
const ownStmtPos = c.indexOf(OWN_STMT_MARKER);
if (ownStmtPos < 0) { console.error('OwnerStatement not found'); process.exit(1); }

// Walk backwards from ownStmtPos to find "  );\n}" (closing of CashierWallet)
// The pattern is:  </section>\n    </div>\n  );\n}\n\n//
const CASHIER_END = `      </section>\n    </div>\n  );\n}`;
const cashierEndPos = c.lastIndexOf(CASHIER_END, ownStmtPos);
console.log('cashierEndPos:', cashierEndPos);
if (cashierEndPos < 0) { console.error('cashier end not found'); process.exit(1); }

const sectionEndPos = cashierEndPos + CASHIER_END.length;

// The content from afterHero to sectionEndPos is what we replace
const OLD_BLOCK = c.substring(afterHero, sectionEndPos);
console.log('OLD_BLOCK starts:', OLD_BLOCK.substring(0, 80));
console.log('OLD_BLOCK ends:', OLD_BLOCK.substring(OLD_BLOCK.length - 80));

// Build the new block - tabs + sales section (existing content) + expenses section
const existingSalesContent = OLD_BLOCK
  .replace(/^<section[^>]*>/, '')   // strip opening tag
  .replace(/<\/section>\s*$/, '');  // strip closing tag

const NEW_BLOCK = `{/* ── Sales / Expenses Tabs ── */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2">
          <button
            onClick={() => setCashierTab("sales")}
            className={\`flex items-center justify-center gap-2 py-3 text-sm font-black transition \${
              cashierTab === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }\`}>
            <Receipt className="h-4 w-4" /> Sales
          </button>
          <button
            onClick={() => setCashierTab("expenses")}
            className={\`flex items-center justify-center gap-2 py-3 text-sm font-black transition \${
              cashierTab === "expenses" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }\`}>
            <TrendingDown className="h-4 w-4" /> Expenses
          </button>
        </div>
      </div>

      {cashierTab === "sales" ? (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-xl">Records</h2>
          <span className="text-sm text-muted-foreground">{totalRecords} records</span>
        </div>
        <PaginationBar page={page} totalPages={totalPages} total={totalRecords} onPrev={handlePrev} onNext={handleNext} />
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl h-20 bg-muted/30 animate-pulse" />)}</div>
        ) : flatRecords.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No records yet.</div>
        ) : (
          <div className="space-y-2">
            {flatRecords.map((rec) => {
              if (rec.kind === "tx") {
                const tx = rec.data;
                const isTransferIn = tx.type === "transfer_in";
                const isTransferOut = tx.type === "transfer_out";
                const isBottlePack = tx.type === "bottle_finished" || tx.type === "pack_finished";
                const isCreditPay  = tx.type === "credit_payment";
                const isCreditCharge = tx.type === "credit_charge";
                const isCashierExpense = tx.type === "cashier_expense";

                if (isCashierExpense) {
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-pink-500/30 flex items-center gap-3"
                      style={{ background: "oklch(0.18 0.05 340 / 0.35)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-pink-500/20 border-pink-500/30">
                        <TrendingDown className="h-4 w-4 text-pink-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-semibold text-pink-300 break-words whitespace-normal">{tx.note ?? "Expense"}</div>
                      </div>
                      <div className="font-black text-lg shrink-0 text-pink-400">-\${fmt(Math.abs(Number(tx.amount)))}</div>
                    </div>
                  );
                }

                if (isTransferOut) {
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-red-500/30 flex items-center gap-3"
                      style={{ background: "oklch(0.20 0.05 27 / 0.35)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-red-500/20 border-red-500/30">
                        <ArrowDownLeft className="h-4 w-4 text-red-400 rotate-180" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-semibold text-red-300 break-words whitespace-normal">{tx.note ?? "Cleared to owner"}</div>
                      </div>
                      <div className="font-black text-lg shrink-0 text-red-400">\${fmt(Math.abs(Number(tx.amount)))}</div>
                    </div>
                  );
                }

                if (isTransferIn) {
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-center gap-3"
                      style={{ background: "oklch(0.22 0.06 145 / 0.3)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/20 border-green-500/30">
                        <ArrowDownLeft className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-semibold text-green-300 break-words whitespace-normal">{tx.note ?? "Cleared from cashier"}</div>
                      </div>
                      <div className="font-black text-lg shrink-0 text-green-400">+\${fmt(Number(tx.amount))}</div>
                    </div>
                  );
                }
                if (isBottlePack) {
                  const isPack = tx.type === "pack_finished";
                  const bpParts = (tx.note ?? "").split(" | ");
                  const bpTitle = bpParts[0] ?? (isPack ? "Pack sold out" : "Bottle closed");
                  const bpSub1  = bpParts[1] ?? "";
                  const bpSub2  = bpParts[2] ?? "";
                  const bpSub3  = bpParts[3] ?? "";
                  const bpPrice   = parseFloat((bpSub1.match(/\\$([\d.]+)/) ?? [])[1] ?? "0");
                  const bpRev     = parseFloat((bpSub3.match(/\\$([\d.]+)/) ?? [])[1] ?? "0");
                  const bpDiff    = bpRev - bpPrice;
                  const bpHasNums = !isNaN(bpPrice) && !isNaN(bpRev) && (bpPrice > 0 || bpRev > 0);
                  return (
                    <div key={tx.id} className={\`rounded-xl p-4 border flex items-start gap-3 \${isPack ? "border-green-500/30" : "border-amber-500/30"}\`}
                      style={{ background: isPack ? "oklch(0.20 0.05 145 / 0.35)" : "oklch(0.20 0.06 80 / 0.35)" }}>
                      <div className={\`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border text-lg \${isPack ? "bg-green-500/20 border-green-500/30" : "bg-amber-500/20 border-amber-500/30"}\`}>
                        {isPack ? "🚬" : "🍾"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className={\`text-sm font-black mt-0.5 \${isPack ? "text-green-300" : "text-amber-300"}\`}>{bpTitle}</div>
                        {bpSub1 && <div className="text-xs text-muted-foreground mt-0.5">{bpSub1}</div>}
                        {bpSub2 && <div className="text-xs text-muted-foreground mt-0.5">{bpSub2}</div>}
                        {bpSub3 && <div className={\`text-xs font-semibold mt-0.5 \${isPack ? "text-green-400" : "text-amber-400"}\`}>{bpSub3}</div>}
                        {bpHasNums && (
                          <div className="text-xs font-black mt-1" style={{ color: bpDiff >= 0 ? "#86efac" : "#fca5a5" }}>
                            {bpDiff >= 0 ? \`Gain: +\$\${bpDiff.toFixed(2)}\` : \`Loss: -\$\${Math.abs(bpDiff).toFixed(2)}\`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                if (isCreditPay) {
                  const cpParts  = (tx.note ?? "").split(" | ");
                  const cpTitle  = cpParts[0] ?? "Credit payment";
                  const cpPaid   = cpParts.find(p => p.startsWith("Paid:")) ?? "";
                  const cpRemain = cpParts.find(p => p.startsWith("Remaining:") || p.startsWith("Balance remaining:")) ?? "";
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-green-500/30 flex items-start gap-3"
                      style={{ background: "oklch(0.20 0.06 145 / 0.25)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/30 text-lg">💳</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-black text-green-300 mt-0.5">{cpTitle}</div>
                        {(cpPaid || cpRemain) && (
                          <div className="text-xs text-muted-foreground mt-0.5">{[cpPaid, cpRemain].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                      {Number(tx.amount) > 0 && (
                        <div className="font-black text-lg shrink-0 text-green-400 mt-1">+\${fmt(Number(tx.amount))}</div>
                      )}
                    </div>
                  );
                }
                if (isCreditCharge) {
                  const ccParts  = (tx.note ?? "").split(" | ");
                  const ccTitle  = ccParts[0] ?? "Credit charge";
                  const ccAmount = ccParts.find(p => p.startsWith("$")) ?? "";
                  const ccBal    = ccParts.find(p => p.startsWith("Balance owed:")) ?? "";
                  const ccItems  = ccParts.find(p => p.startsWith("Items:"))?.replace("Items: ", "") ?? "";
                  return (
                    <div key={tx.id} className="rounded-xl p-4 border border-orange-500/30 flex items-start gap-3"
                      style={{ background: "oklch(0.20 0.04 45 / 0.30)" }}>
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-orange-500/15 border-orange-500/30 text-lg">🪙</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                        <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>{ccTitle}</div>
                        {ccItems && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">{ccItems}</div>}
                        {ccAmount && <div className="text-sm font-black text-green-400 mt-0.5">{ccAmount}</div>}
                        {ccBal && <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--primary)" }}>{ccBal}</div>}
                      </div>
                    </div>
                  );
                }
                return null;
              }
              const o = rec.data;
              return (
                <div key={o.id} className="rounded-xl p-4 border border-green-500/20 flex items-start gap-3"
                  style={{ background: "oklch(0.20 0.05 145 / 0.20)" }}>
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border bg-green-500/15 border-green-500/25 text-base">💵</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}</div>
                    <div className="text-sm font-black mt-0.5" style={{ color: "var(--primary)" }}>Cash: Sale</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words whitespace-normal">
                      {(o.items || []).map((i) => \`\${i.qty}× \${i.name}\`).join(", ")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Paid \${fmt(Number(o.paid))} · Change \${fmt(Number(o.change_given))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-black text-sm text-green-400">+\${fmt(Number(o.total))}</span>
                    {o.id === deletableOrderId && (
                      <button
                        onClick={() => deleteLatestCashierOrder(o)}
                        disabled={deletingOrderId === o.id}
                        className="h-8 w-8 rounded-full flex items-center justify-center bg-red-600 active:scale-95 transition disabled:opacity-50"
                        title="Delete this sale"
                      >
                        {deletingOrderId === o.id
                          ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 text-white" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={totalRecords} onPrev={handlePrev} onNext={handleNext} />
      </section>
      ) : (
      /* ── Expenses Tab ── */
      <section className="space-y-3 pb-24">
        {/* Add Expense form */}
        <div className="space-y-2">
          <button
            onClick={() => setShowAddExpense(v => !v)}
            className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] border"
            style={showAddExpense
              ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)", borderColor: "transparent" }
              : { background: "var(--gradient-card)", borderColor: "var(--border)", color: "var(--primary)" }}>
            {showAddExpense ? "✕ Cancel" : "+ Add Expense"}
          </button>

          {showAddExpense && (
            <div className="rounded-2xl border border-border p-4 space-y-3" style={{ background: "var(--gradient-card)" }}>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Expense Lines</p>
              {expenseLines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={line.description}
                    onChange={e => updateExpenseLine(i, "description", e.target.value)}
                    placeholder="Description (e.g. Staff Salary)"
                    className="flex-1 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    value={line.amount}
                    onChange={e => updateExpenseLine(i, "amount", e.target.value)}
                    placeholder="\$0.00"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 h-10 rounded-xl border border-border bg-muted px-3 text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                  />
                  {expenseLines.length > 1 && (
                    <button onClick={() => removeExpenseLine(i)}
                      className="h-10 w-10 rounded-xl flex items-center justify-center bg-destructive/15 text-destructive active:scale-90 transition shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addExpenseLine}
                className="w-full h-9 rounded-xl border border-dashed border-border text-xs font-black text-muted-foreground hover:text-foreground transition active:scale-[0.98]">
                + Add Line
              </button>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground font-semibold">
                  Total: <span className="font-black text-foreground">
                    \${expenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0).toFixed(2)}
                  </span>
                </span>
                <button onClick={handleSaveCashierExpense} disabled={savingExpense}
                  className="h-10 px-6 rounded-xl font-black text-sm text-primary-foreground disabled:opacity-50 flex items-center gap-2 transition active:scale-95"
                  style={{ background: "var(--gradient-hero)" }}>
                  {savingExpense ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Expense
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Expense history by month */}
        {loadingExpenses ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl h-16 bg-muted/30 animate-pulse" />)}</div>
        ) : cashierExpenseMonths.length === 0 ? (
          <div className="text-muted-foreground text-sm py-8 text-center">No expenses yet.</div>
        ) : (
          <div className="space-y-2">
            <h3 className="font-black text-sm text-muted-foreground uppercase tracking-wider px-1">Expense History</h3>
            {cashierExpenseMonths.map((mk) => {
              const mExpenses = cashierExpensesByMonth[mk];
              const mTotal = mExpenses.reduce((s, e) => s + Number(e.amount), 0);
              const isOpen = openExpenseMonth === mk;
              return (
                <div key={mk} className="rounded-2xl border border-border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                    onClick={() => setOpenExpenseMonth(isOpen ? null : mk)}>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-sm sm:text-base">{monthLabel(mk)}</span>
                      <span className="text-xs text-muted-foreground">{mExpenses.length} {mExpenses.length === 1 ? "entry" : "entries"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-pink-400 font-bold">-\${fmt(mTotal)}</span>
                      <ChevronDown className={\`h-4 w-4 text-muted-foreground transition-transform \${isOpen ? "rotate-180" : ""}\`} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {mExpenses.map((e) => {
                        const raw = (e.description ?? "").replace(/\\[Cashier:[^\\]]+\\]\\s*$/, "").trim();
                        const isBulk = raw.startsWith("Bulk Expense");
                        if (isBulk) {
                          const lines = raw.split("\\n").filter(Boolean);
                          return (
                            <div key={e.id} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-black text-sm">{lines[0]}</div>
                                  <div className="mt-1 space-y-0.5">
                                    {lines.slice(1).map((line, li) => (
                                      <div key={li} className="text-xs text-muted-foreground">{line}</div>
                                    ))}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {new Date(e.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}
                                  </div>
                                </div>
                                <span className="shrink-0 font-black text-sm text-pink-400">-\${fmt(Number(e.amount))}</span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold break-words">{raw || "Expense"}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {new Date(e.created_at).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, day: "numeric", month: "short", year: "numeric" })}
                              </div>
                            </div>
                            <span className="shrink-0 font-black text-sm text-pink-400">-\${fmt(Number(e.amount))}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}
    </div>
  );
}`;

c = c.substring(0, afterHero - 1) + '\n        </div>\n      </section>\n\n      ' + NEW_BLOCK + c.substring(sectionEndPos);

// Hmm, this approach still needs me to find the exact hero ending context.
// Let me just do a clean replacement: find from afterHero position to sectionEndPos
const before = c.substring(0, afterHero);
const after  = c.substring(sectionEndPos);

writeFileSync(file, before + NEW_BLOCK + after, 'utf8');
console.log('Done.');
