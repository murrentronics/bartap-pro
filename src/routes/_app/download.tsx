import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, BookOpen, X, Phone } from "lucide-react";

export const Route = createFileRoute("/_app/download")({
  component: DownloadPage,
});

const GITHUB_OWNER = "murrentronics";
const GITHUB_REPO  = "bartap-pro";
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const APK_FALLBACK = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/bartendaz-pro.apk`;

type ReleaseInfo = {
  version: string;
  apkUrl: string;
  publishedAt: string;
};

function useLatestRelease() {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json() as {
          tag_name: string;
          published_at: string;
          assets: { name: string; browser_download_url: string }[];
        };
        const apkAsset = data.assets.find((a) => a.name.endsWith(".apk"));
        setInfo({
          version: data.tag_name?.replace(/^v/, "") ?? "",
          apkUrl: apkAsset?.browser_download_url ?? APK_FALLBACK,
          publishedAt: data.published_at ?? "",
        });
      } catch {
        setInfo({ version: "", apkUrl: APK_FALLBACK, publishedAt: "" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { info, loading };
}

// ── Manual modal ──────────────────────────────────────────────────────────────

function ManualModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl mx-auto my-4 rounded-3xl overflow-hidden flex-1"
        style={{ background: "#140d04", border: "1px solid rgba(240,160,48,0.2)", maxHeight: "calc(100vh - 32px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "rgba(240,160,48,0.15)", background: "rgba(240,160,48,0.06)" }}>
          <span className="font-black text-sm" style={{ color: "#F0A030" }}>📖 Bartendaz Pro — User Manual</span>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition">
            <X className="h-4 w-4 text-white/70" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8 text-sm" style={{ color: "#f5f0e8" }}>

          {/* Cover */}
          <div className="text-center py-6 space-y-2">
            <div className="text-5xl">🍺</div>
            <h2 className="font-black text-2xl" style={{ color: "#F0A030" }}>Bartendaz Pro</h2>
            <p className="text-xs leading-relaxed max-w-md mx-auto" style={{ color: "#8a7a6a" }}>
              The complete guide to running your bar — from opening the session to closing the night, every feature explained step by step.
            </p>
          </div>

          {/* TOC */}
          <div className="rounded-2xl p-4 space-y-1" style={{ background: "rgba(240,160,48,0.06)", border: "1px solid rgba(240,160,48,0.15)" }}>
            <h3 className="font-black text-xs uppercase tracking-widest mb-3" style={{ color: "#F0A030" }}>Table of Contents</h3>
            {[
              "1. Signing In & Account Roles",
              "2. Opening & Closing the Bar Session",
              "3. Bar (POS) — Taking Orders",
              "4. Cash Sales & Change",
              "5. Credit Sales (Charge to Tab)",
              "6. Opened Bottles & Drink Sales",
              "7. Cigarette & Rolling Paper Packs",
              "8. Specials & Bundle Deals",
              "9. Items (Product Catalog)",
              "10. Wallet & Financial Overview",
              "11. Customers (Credit Accounts)",
              "12. Staff (Cashiers & Managers)",
              "13. Manager — Bar Expense",
              "14. Machines Tracker",
              "15. Music Player",
              "16. Summary Reports",
              "17. Profile & Settings",
              "18. Offline Mode & Sync",
            ].map((item) => (
              <div key={item} className="text-xs py-1.5 border-b last:border-0" style={{ color: "#c8b89a", borderColor: "rgba(240,160,48,0.08)" }}>
                {item}
              </div>
            ))}
          </div>

          {/* Sections */}
          {[
            {
              id: "1", icon: "🔐", title: "Signing In & Account Roles",
              steps: [
                ["Open the app", "Launch Bartendaz Pro in your browser or via the installed APK."],
                ["Enter credentials", "Owners use their email. Cashiers use the username set by the owner — no email needed."],
                ["Tap Sign In", "Owners land on Bar (POS). Cashiers on Bar. Managers on Items."],
              ],
              tip: "Forgot your password? Tap \"Forgot password?\" on the login screen to receive a reset email.",
            },
            {
              id: "2", icon: "📅", title: "Opening & Closing the Bar Session",
              steps: [
                ["Navigate to Bar", "Go to the Bar page. If closed you'll see a lock screen overlay."],
                ["Tap 'Open Bar Now'", "A modal asks for the Bar Float (starting cash). Set the Machine float too if you have the Machines add-on."],
                ["Enter float and confirm", "Session starts. POS becomes active. Float tracking begins."],
                ["Close at end of night", "In Wallet, tap Close Bar to end the session. Sales are blocked until reopened."],
              ],
              tip: "Cashier change mid-session: Wallet → Float section → Update Float → New Session to swap cashiers without ending the night.",
            },
            {
              id: "3", icon: "🍺", title: "Bar (POS) — Taking Orders",
              steps: [
                ["Select a category tab", "Tap Beer, Rum, Soft Drinks, etc. to filter products."],
                ["Tap a product", "Each tap adds 1 unit. Use +/− to adjust. Tap X to remove."],
                ["Choose cash or credit", "Tap Cash Sale or Credit Sale to proceed to checkout."],
              ],
              tip: "Scan a barcode using the USB scanner icon to instantly find and add a product.",
            },
            {
              id: "4", icon: "💵", title: "Cash Sales & Change",
              steps: [
                ["Review cart total", "Confirm items and total in the cart panel."],
                ["Tap Cash Sale", "A numpad appears to enter the amount tendered."],
                ["Confirm", "Change is calculated and displayed. Receipt modal appears."],
              ],
              tip: "The receipt modal lets you print via Bluetooth printer, USB printer, or share as PDF via WhatsApp.",
            },
            {
              id: "5", icon: "💳", title: "Credit Sales (Charge to Tab)",
              steps: [
                ["Tap Credit Sale", "Select a customer from the dropdown or create one on the spot."],
                ["Confirm the charge", "The balance is added to the customer's account immediately."],
                ["View balance", "Go to Customers in the menu to see all tabs and histories."],
              ],
              tip: "You can charge multiple items in one credit sale. The customer's running balance updates in real time.",
            },
            {
              id: "6", icon: "🍾", title: "Opened Bottles & Drink Sales",
              steps: [
                ["Find a bottle product", "Products with bottle variations show a bottle icon."],
                ["Select a variation", "Choose Shot, Half, Full or custom sizes set by the owner."],
                ["Sell", "Each variation deducts the correct units from stock."],
              ],
              tip: "Opened bottles track remaining units. The system warns when a bottle is nearly empty.",
            },
            {
              id: "7", icon: "🚬", title: "Cigarette & Rolling Paper Packs",
              steps: [
                ["Set up pack products", "Products with pack splitting enabled show a pack icon."],
                ["Sell by unit or pack", "Tap to sell a full pack, or select individual units."],
                ["Stock auto-deducts", "Each unit sold reduces pack stock accordingly."],
              ],
            },
            {
              id: "8", icon: "🎁", title: "Specials & Bundle Deals",
              steps: [
                ["Go to Specials", "Owners create bundles from the Specials menu item."],
                ["Set bundle items and price", "Pick multiple products and set a discounted bundle price."],
                ["Sell the bundle", "Bundles appear as a product card on the POS register."],
              ],
            },
            {
              id: "9", icon: "📦", title: "Items (Product Catalog)",
              steps: [
                ["Go to Items", "Owners and managers can access the full product list."],
                ["Add or edit a product", "Set name, category, price, cost price, photo, and stock quantity."],
                ["Manage stock", "Stock auto-decrements on sale. Manual adjustments available anytime."],
              ],
              tip: "Products with no stock show as Out of Stock on the register and cannot be added to a cart.",
            },
            {
              id: "10", icon: "💰", title: "Wallet & Financial Overview",
              steps: [
                ["Go to Wallet", "See your float, total sales, expenses, and net for the current session."],
                ["View session history", "Past sessions show locked totals with full transaction lists."],
                ["Cashier wallets", "Each cashier's wallet tracks their own float and sales separately."],
              ],
            },
            {
              id: "11", icon: "👤", title: "Customers (Credit Accounts)",
              steps: [
                ["Create account", "Menu → Customers → + Create. Enter name, contact, ID type and number."],
                ["Charge a customer", "Via Credit Sale at POS. Balance increases per charge."],
                ["Record a payment", "Tap customer → Add Payment → enter amount. Balance decreases."],
                ["Download a bill", "Tap Bill to generate a PDF statement to share with the customer."],
              ],
            },
            {
              id: "12", icon: "👥", title: "Staff (Cashiers & Managers)",
              steps: [
                ["Add staff", "Menu → Staff → + Add. Set a username and PIN or password."],
                ["Set role", "Choose Cashier or Manager. Managers can record expenses and view reports."],
                ["Suspend or remove", "Tap a staff member to suspend or delete their account instantly."],
              ],
              tip: "Cashiers can only see the register, wallet (their own), and customers. Managers have additional access to Items, Stock, and Expenses.",
            },
            {
              id: "13", icon: "📉", title: "Manager — Bar Expense",
              steps: [
                ["Go to Manage", "Managers tap Manage in the menu to record bar expenses."],
                ["Enter expense", "Set description, amount, and date. Saved to the session."],
                ["View in Wallet", "Expenses appear in the Wallet expense list and reduce net profit."],
              ],
            },
            {
              id: "14", icon: "🎰", title: "Machines Tracker",
              steps: [
                ["Go to Machines", "Lists all registered gaming machines with current float and stats."],
                ["Record a payout", "Tap a machine → Add Payout → enter amount paid out."],
                ["Record income", "Tap a machine → Add Income → enter amount collected."],
                ["View reports", "Per-machine profit reports show IN/OUT history and net per session."],
              ],
            },
            {
              id: "15", icon: "🎵", title: "Music Player",
              steps: [
                ["Tap Music in the header", "Opens the YouTube music search panel."],
                ["Search a song or artist", "Type and tap Search. Results appear as a playlist."],
                ["Tap to play", "Audio plays in the background. Mini controls always visible."],
              ],
              tip: "The music player keeps playing while you use the rest of the app. Tap Bar/Machines in the header to return to work.",
            },
            {
              id: "16", icon: "📊", title: "Summary Reports",
              steps: [
                ["Go to Summary", "Owner-only. Shows bar sales, item costs, gross profit, expenses, and net."],
                ["Filter by period", "Choose Day, Week, Month, Year, or Custom date range."],
                ["Export PDF", "Tap the PDF button to download or share a formatted summary report."],
              ],
            },
            {
              id: "17", icon: "⚙️", title: "Profile & Settings",
              steps: [
                ["Tap Profile", "Update your bar name, contact details, and change your password."],
                ["Change password", "Enter current password, then new password and confirm."],
                ["Language", "Switch between English and Spanish from the Language option in the menu."],
              ],
            },
            {
              id: "18", icon: "📴", title: "Offline Mode & Sync",
              steps: [
                ["Keep selling offline", "The app detects loss of internet and queues orders locally."],
                ["Sync on reconnect", "Once the connection is restored, all queued orders sync automatically."],
                ["Banner indicator", "An orange banner at the top shows when you're offline."],
              ],
              tip: "All product and customer data is cached locally so the register is fully functional without internet.",
            },
          ].map((section) => (
            <div key={section.id} className="space-y-3">
              <div className="flex items-center gap-3 pb-2 border-b" style={{ borderColor: "rgba(240,160,48,0.15)" }}>
                <span className="text-xl">{section.icon}</span>
                <div>
                  <h3 className="font-black text-sm">{section.title}</h3>
                  <span className="text-[10px] font-bold" style={{ color: "#F0A030" }}>Section {section.id}</span>
                </div>
              </div>
              <div className="space-y-2">
                {section.steps.map(([title, desc], i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", color: "#fff" }}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-bold text-xs">{title}</div>
                      <div className="text-xs leading-relaxed" style={{ color: "#8a7a6a" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              {section.tip && (
                <div className="flex gap-2 rounded-xl p-3" style={{ background: "rgba(240,160,48,0.07)", border: "1px solid rgba(240,160,48,0.18)" }}>
                  <span className="text-base shrink-0">💡</span>
                  <p className="text-xs leading-relaxed" style={{ color: "#c8b89a" }}>{section.tip}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function DownloadPage() {
  const { info, loading } = useLatestRelease();
  const [showManual, setShowManual] = useState(false);

  const apkUrl = info?.apkUrl ?? APK_FALLBACK;
  const version = info?.version ?? "";
  const publishedAt = info?.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="min-h-full overflow-y-auto pb-24" style={{ background: "var(--gradient-card)" }}>

      {/* Manual modal */}
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}

      {/* Floating manual button */}
      <button
        onClick={() => setShowManual(true)}
        className="fixed top-20 right-4 z-50 flex items-center gap-2 px-3 h-9 rounded-xl font-black text-xs transition active:scale-95 text-primary-foreground shadow-lg"
        style={{ background: "var(--gradient-hero)" }}
      >
        <BookOpen className="h-4 w-4" />
        Manual
      </button>

      {/* ── HERO ── */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-20 space-y-6"
        style={{
          background: "radial-gradient(ellipse at 30% 0%, rgba(240,160,48,0.10) 0%, transparent 60%), radial-gradient(ellipse at 70% 100%, rgba(192,68,26,0.08) 0%, transparent 60%)",
        }}
      >
        {/* Logo */}
        <div className="h-20 w-20 rounded-3xl flex items-center justify-center shadow-2xl"
          style={{ background: "linear-gradient(135deg,#C0441A 0%,#F0A030 55%,#ffb700 100%)" }}>
          <span className="text-4xl">🍺</span>
        </div>

        <div className="space-y-2">
          <h1 className="font-black text-4xl tracking-tight"
            style={{ background: "linear-gradient(135deg,#F0A030 0%,#C0441A 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Bartendaz Pro
          </h1>
          <p className="text-base max-w-md mx-auto leading-relaxed" style={{ color: "#8a7a6a" }}>
            The fast, simple bar POS for owners and cashiers. Manage products, wallets, and staff — all from your Android device.
          </p>
        </div>

        {/* Download button */}
        <div className="flex flex-col items-center gap-2">
          <a
            href={apkUrl}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl font-black text-base transition active:scale-95 shadow-xl"
            style={{ background: "linear-gradient(135deg,#C0441A 0%,#F0A030 55%,#ffb700 100%)", color: "#fff" }}
          >
            <Download className="h-5 w-5" />
            Download for Android
          </a>
          <span className="text-xs font-semibold" style={{ color: "#8a7a6a" }}>
            {loading ? "Checking for latest release…" : version ? `v${version}${publishedAt ? ` · ${publishedAt}` : ""} · APK · Android 7.0+` : "APK · Android 7.0+"}
          </span>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <h2 className="text-center font-black text-2xl mb-2">
          Everything your bar{" "}
          <span style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            needs
          </span>
        </h2>
        <div className="h-px mx-auto w-16 mb-10 rounded-full" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)" }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ["🍺", "Fast POS Register", "Ring up drinks, shots, and packs in seconds. Product grid with categories, cart with quantity controls, cash and credit checkout."],
            ["💰", "Wallet System", "Owners and cashiers each have a wallet. Every sale, transfer, and expense is tracked in real time."],
            ["👥", "Staff Management", "Add cashiers and managers, set roles, suspend or remove staff instantly. Each cashier has their own wallet and session float."],
            ["📦", "Product Catalog & Stock", "Full menu with photos, prices, categories, and automatic stock deduction on every sale. Stock Count with split-panel view."],
            ["💳", "Credit Tab Management", "Open customer tabs, charge items on credit, accept payments, and track every customer's outstanding balance in real time."],
            ["🖨️", "Receipt Printing", "Print receipts to any USB or Bluetooth thermal printer, or share as a PDF via WhatsApp straight from the receipt modal."],
            ["📊", "Financial Summary", "Bar sales, item costs, gross profit, expenses, and net profit — filtered by day, week, month, year, or custom period."],
            ["🎵", "YouTube Music Player", "Search and play YouTube music in the background while you work. Controls always visible in the mini player bar."],
            ["📴", "Offline Mode", "Keep selling when the internet drops. Orders queue locally and sync automatically the moment the connection is restored."],
            ["🔒", "Secure & Private", "Your data stays in your Supabase account. No third-party access. Role-based permissions at every level."],
          ].map(([icon, title, desc]) => (
            <div key={title} className="rounded-2xl p-5 space-y-2 border transition hover:-translate-y-0.5"
              style={{ background: "rgba(240,160,48,0.04)", borderColor: "rgba(240,160,48,0.12)" }}>
              <div className="text-2xl">{icon}</div>
              <h3 className="font-black text-sm">{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "#8a7a6a" }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <h2 className="text-center font-black text-2xl mb-2">
          Simple{" "}
          <span style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            pricing
          </span>
        </h2>
        <div className="h-px mx-auto w-16 mb-4 rounded-full" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)" }} />
        <p className="text-center text-sm mb-10" style={{ color: "#8a7a6a" }}>All prices in Trinidad &amp; Tobago dollars (TT$)</p>

        {/* ── Row 1: Bar plans ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">

          {/* Basic */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.05)", borderColor: "rgba(240,160,48,0.35)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", color: "#1a0a02" }}>
              🍺 Bar Only
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>1,800</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Full bar POS — renewed yearly</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Full POS / register system","Unlimited products & cashiers","Stock tracking","Credit tab management","Sales & financial reports","Music player","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>

          {/* Bar Only Addon */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.04)", borderColor: "rgba(240,160,48,0.25)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "rgba(240,160,48,0.15)", color: "#F0A030", border: "1px solid rgba(240,160,48,0.4)" }}>
              🍺 Bar Addon
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>1,200</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Bar add-on for an existing machines account</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Adds full bar POS to your plan","Unlimited products & cashiers","Stock & credit tracking","Sales reports","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Row 2: Machines Only plans ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">

          {/* Machines Only — 10 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "linear-gradient(160deg,#1a0e03,#140d04)", borderColor: "rgba(245,158,11,0.4)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)", color: "#1a0a02" }}>
              🎰 Machines Only · 10
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#f59e0b" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>2,400</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Track up to 10 gaming machines</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Machines payout tracker","Per-machine profit reports","Float session management","Full history PDF export","Machine monitor (IN/OUT)","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(245,158,11,0.08)" }}>
                  <span style={{ color: "#f59e0b" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>

          {/* Machines Only — 20 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "linear-gradient(160deg,#1a0e03,#140d04)", borderColor: "rgba(245,158,11,0.55)", boxShadow: "0 6px 24px rgba(245,158,11,0.12)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "linear-gradient(135deg,#ea580c,#f59e0b)", color: "#1a0a02" }}>
              🎰 Machines Only · 20
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#f59e0b" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>3,600</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Track up to 20 gaming machines</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Everything in Machines Only · 10","Up to 20 machines","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(245,158,11,0.08)" }}>
                  <span style={{ color: "#f59e0b" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Row 3: Machines + Bar addon ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">

          {/* Machines + Bar Addon — 10 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.05)", borderColor: "rgba(240,160,48,0.35)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "rgba(240,160,48,0.15)", color: "#F0A030", border: "1px solid rgba(240,160,48,0.4)" }}>
              🎰 Machines Addon · 10
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>1,800</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Bar addon on a 10-machine plan</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Full bar POS + 10 machines","All bar & machines features","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>

          {/* Machines + Bar Addon — 20 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.05)", borderColor: "rgba(240,160,48,0.35)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "rgba(240,160,48,0.15)", color: "#F0A030", border: "1px solid rgba(240,160,48,0.4)" }}>
              🎰 Machines Addon · 20
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>2,400</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Bar addon on a 20-machine plan</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Full bar POS + 20 machines","All bar & machines features","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Row 4: Premium (bar + machines bundle) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">

          {/* Premium — 10 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "linear-gradient(160deg,#1c0f02,#140d04)", borderColor: "rgba(240,160,48,0.6)", boxShadow: "0 8px 32px rgba(240,160,48,0.15)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", color: "#1a0a02" }}>
              ⭐ Premium · 10
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>3,500</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Full bar + 10 machines, all-in-one</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Everything in Basic","10 machines tracker","Per-machine profit reports","Float session management","Full history PDF export","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>

          {/* Premium — 20 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "linear-gradient(160deg,#1c0f02,#140d04)", borderColor: "rgba(240,160,48,0.7)", boxShadow: "0 8px 32px rgba(240,160,48,0.20)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", color: "#1a0a02" }}>
              ⭐ Premium · 20
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>4,000</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Full bar + 20 machines, all-in-one</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Everything in Premium · 10","Up to 20 machines","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Row 5: Premium Addon ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">

          {/* Premium Addon — 10 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.04)", borderColor: "rgba(240,160,48,0.28)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "rgba(240,160,48,0.12)", color: "#F0A030", border: "1px solid rgba(240,160,48,0.35)" }}>
              ⭐ Premium Addon · 10
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>3,000</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Premium upgrade addon — 10 machines</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Premium features addon","10 machines tracker","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>

          {/* Premium Addon — 20 */}
          <div className="rounded-3xl p-6 flex flex-col items-center text-center space-y-3 border-2"
            style={{ background: "rgba(240,160,48,0.04)", borderColor: "rgba(240,160,48,0.28)" }}>
            <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest"
              style={{ background: "rgba(240,160,48,0.12)", color: "#F0A030", border: "1px solid rgba(240,160,48,0.35)" }}>
              ⭐ Premium Addon · 20
            </div>
            <div>
              <span className="text-lg font-bold" style={{ color: "#F0A030" }}>$</span>
              <span className="text-5xl font-black" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>3,400</span>
              <span className="text-base font-semibold ml-1" style={{ color: "#8a7a6a" }}>TT / yr</span>
            </div>
            <p className="text-xs" style={{ color: "#8a7a6a" }}>Premium upgrade addon — 20 machines</p>
            <ul className="text-xs space-y-2 text-left w-full" style={{ color: "#c8b89a" }}>
              {["Premium features addon","20 machines tracker","12 months access"].map(f => (
                <li key={f} className="flex gap-2 pb-1.5 border-b last:border-0" style={{ borderColor: "rgba(240,160,48,0.08)" }}>
                  <span style={{ color: "#F0A030" }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-xs" style={{ color: "#8a7a6a" }}>
          All prices TT$. Plans renew annually. Contact us to get started.
        </p>
      </section>

      {/* ── INSTALL STEPS ── */}
      <section className="px-6 py-16 max-w-lg mx-auto">
        <h2 className="text-center font-black text-2xl mb-2">
          How to{" "}
          <span style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            install
          </span>
        </h2>
        <div className="h-px mx-auto w-16 mb-10 rounded-full" style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)" }} />
        <div className="space-y-6">
          {[
            ["Download the APK", "Tap the download button above on your Android device."],
            ["Allow unknown sources", "When prompted, tap \"Install anyway\" or go to Settings → Security → allow installs from this source."],
            ["Open and sign in", "Launch Bartendaz Pro and sign in with your owner account or cashier username."],
          ].map(([title, desc], i) => (
            <div key={i} className="flex gap-4">
              <div className="h-9 w-9 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                style={{ background: "linear-gradient(135deg,#C0441A,#F0A030)", color: "#fff" }}>
                {i + 1}
              </div>
              <div className="pt-1">
                <h4 className="font-black text-sm">{title}</h4>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: "#8a7a6a" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="px-6 py-16 text-center space-y-4 max-w-lg mx-auto">
        <h2 className="font-black text-2xl">Ready to run your bar smarter?</h2>
        <p className="text-sm" style={{ color: "#8a7a6a" }}>
          Download now and choose your plan after signing up. Starting at $1,200 TT / year.
        </p>
        <a
          href={apkUrl}
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl font-black text-base transition active:scale-95 shadow-xl"
          style={{ background: "linear-gradient(135deg,#C0441A 0%,#F0A030 55%,#ffb700 100%)", color: "#fff" }}
        >
          <Download className="h-5 w-5" />
          Download Bartendaz Pro
        </a>
      </section>

      {/* ── SUPPORT / CONTACT ── */}
      <section className="px-6 py-12 max-w-lg mx-auto">
        <div className="rounded-3xl p-8 text-center space-y-4 border-2"
          style={{ background: "linear-gradient(135deg,rgba(240,160,48,0.06),rgba(192,68,26,0.06))", borderColor: "rgba(240,160,48,0.25)" }}>
          <div className="text-5xl">💬</div>
          <h3 className="font-black text-xl"
            style={{ background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Need Help?
          </h3>
          <p className="text-sm" style={{ color: "#8a7a6a" }}>Contact us to get started, renew a plan, or get support.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="https://wa.me/18687375067"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition active:scale-95"
              style={{ background: "linear-gradient(135deg,#25D366,#128C7E)", color: "#fff" }}
            >
              <span>💬</span> WhatsApp
            </a>
            <a
              href="tel:+18687375067"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border transition hover:border-primary/50 active:scale-95"
              style={{ border: "1px solid rgba(240,160,48,0.3)", color: "#c8b89a" }}
            >
              <Phone className="h-4 w-4" /> 375-5067
            </a>
          </div>
          <div className="font-bold text-lg tracking-wide" style={{ color: "#F0A030" }}>
            Contact Renard — 375-5067
          </div>
        </div>
      </section>

    </div>
  );
}

export default DownloadPage;
