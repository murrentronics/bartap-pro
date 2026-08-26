import { BookOpen } from "lucide-react";

export default function ManualPage() {
  return (
    <div
      className="pb-24"
      style={{
        fontFamily: "Arial, sans-serif",
        color: "#e8d5b0",
        background: "#0a0600",
        minHeight: "100vh",
        margin: "0 -12px",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#0f0a04",
          borderBottom: "1px solid rgba(240,160,48,0.15)",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <BookOpen style={{ width: 20, height: 20, color: "#F0A030" }} />
        <span
          style={{
            fontSize: "1.1rem",
            fontWeight: 900,
            background: "linear-gradient(135deg, #F0A030, #C0441A)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          📖 Bartendaz Pro — User Manual
        </span>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 16px" }}>

        {/* Cover */}
        <div style={{ textAlign: "center", padding: "40px 0 36px", borderBottom: "1px solid rgba(240,160,48,0.12)" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>🍺</div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,#F0A030,#C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "0 0 12px" }}>
            Bartendaz Pro
          </h2>
          <p style={{ fontSize: "0.9rem", color: "#a08060", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
            The complete guide to running your bar — from opening the session to closing the night. Every feature explained step by step.
          </p>
        </div>

        {/* TOC */}
        <div style={{ padding: "28px 0", borderBottom: "1px solid rgba(240,160,48,0.12)" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 900, color: "#F0A030", marginBottom: 14 }}>Table of Contents</h3>
          <ol style={{ paddingLeft: 20, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "6px 24px" }}>
            {[
              ["#m-login",      "Signing In & Account Roles"],
              ["#m-session",    "Opening & Closing the Bar Session"],
              ["#m-pos",        "Bar (POS) — Taking Orders"],
              ["#m-cash",       "Cash Sales & Change"],
              ["#m-credit-sale","Credit Sales (Charge to Tab)"],
              ["#m-bottles",    "Opened Bottles & Drink Sales"],
              ["#m-packs",      "Cigarette & Rolling Paper Packs"],
              ["#m-specials",   "Specials & Bundle Deals"],
              ["#m-discount",   "Order Discounts"],
              ["#m-edit-order", "Editing a Completed Order"],
              ["#m-products",   "Items (Product Catalog)"],
              ["#m-stock",      "Stock Count"],
              ["#m-wallet",     "Wallet & Financial Overview"],
              ["#m-statement",  "Owner Statement"],
              ["#m-customers",  "Customers (Credit Accounts)"],
              ["#m-receipts",   "Printing & Sharing Receipts"],
              ["#m-cashiers",   "Staff (Cashiers)"],
              ["#m-manager",    "Manager — Bar Expense"],
              ["#m-summary",    "Summary Reports"],
              ["#m-music",      "Music Player"],
              ["#m-profile",    "Profile & Settings"],
              ["#m-billing",    "Billing & Subscription"],
              ["#m-offline",    "Offline Mode & Sync"],
            ].map(([href, label], i) => (
              <li key={href} style={{ fontSize: "0.85rem", marginBottom: 2 }}>
                <a href={href} style={{ color: "#F0A030", textDecoration: "none" }} onClick={e => {
                  e.preventDefault();
                  document.getElementById((href as string).slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                  {i + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* Sections */}
        {[
          // ── 1. Login & Roles ───────────────────────────────────────────────
          {
            id: "m-login", icon: "🔐", title: "Signing In & Account Roles", section: "Section 1",
            cards: [
              { title: "👑 Owner", items: ["Full access to all features", "Manage staff, products, wallet", "View all reports and summary", "Billing and plan management", "Open & close bar sessions"] },
              { title: "🧑‍💼 Cashier", items: ["Take orders at the register", "Cash and credit sales", "View own wallet balance", "Print & share receipts", "No access to owner settings"] },
              { title: "📋 Manager", items: ["Record bar expenses", "View items and stock", "Access customer accounts", "No billing or staff management"] },
            ],
            steps: [
              ["Open the app", "Go to the app URL or launch the installed APK on your Android device."],
              ["Enter your credentials", "Owners register an account first. Cashiers and managers are created by the owner inside the app under Staff."],
              ["Land on your home screen", "Owners and cashiers go to the Bar register. Managers go to Items."],
            ],
            tip: "Forgot your password? Use the Forgot Password link on the login page to reset via email.",
          },

          // ── 2. Sessions ───────────────────────────────────────────────────
          {
            id: "m-session", icon: "🕐", title: "Opening & Closing the Bar Session", section: "Section 2",
            intro: "A session represents one shift — from bar open to bar close. All sales, expenses, and wallet transfers are tracked within their session. A session can run overnight or across calendar days; the Summary always shows the full session regardless of clock time.",
            steps: [
              ["Open the Bar tab", "Tap Bar in the menu. If no session is open you will see the Open Session button."],
              ["Set the cashier float", "Enter the starting cash amount for the shift, then confirm to open. This float is recorded per cashier sub-session."],
              ["Start selling", "Once open, cashiers can take orders immediately. All sales are logged in real time and synced across devices."],
              ["Close the session (owner only)", "At end of shift the owner closes the session from the header or Wallet page. This locks the session totals for reporting."],
              ["New session resets the float", "The next time the bar is opened a new sub-session is created. The previous session's totals remain in full in Summary."],
            ],
            tip: "Sessions can span midnight — a session opened Friday at 10 pm and closed Saturday at 4 am is treated as one session, not split by calendar date.",
          },

          // ── 3. POS ───────────────────────────────────────────────────────
          {
            id: "m-pos", icon: "🍺", title: "Bar (POS) — Taking Orders", section: "Section 3",
            intro: "The register is the main screen for cashiers. Add items to the cart, review the order, and complete the sale in seconds.",
            steps: [
              ["Tap items to add to cart", "Browse by category tabs at the top. Tap any product to add one unit to the cart."],
              ["Adjust quantities in the cart", "Tap the − or + buttons on any cart item to change the quantity. Tap the × to remove it entirely."],
              ["Split view", "On the Bar screen tap the split icon (top-right) to show the product grid and cart side by side. Useful on tablets or wide screens."],
              ["Choose cash or credit", "Tap Cash Sale or Credit Sale at the bottom to proceed to checkout."],
              ["Confirm the sale", "Enter the amount tendered (cash) or select the customer (credit), then confirm. The order is recorded instantly."],
            ],
            tip: "Long-press any item in the product grid to enter reorder mode — drag items to rearrange their position. Changes are saved automatically.",
          },

          // ── 4. Cash ───────────────────────────────────────────────────────
          {
            id: "m-cash", icon: "💵", title: "Cash Sales & Change", section: "Section 4",
            steps: [
              ["Build the order", "Add items to the cart as usual. The running total shows at the bottom."],
              ["Tap Cash Sale", "Opens the cash checkout panel with a numpad."],
              ["Enter amount tendered", "Type the cash the customer hands over. Change is calculated instantly and shown in large text."],
              ["Confirm", "Tap Pay / Confirm to record the sale. The cashier's wallet balance is updated and the stock is decremented automatically."],
            ],
            tip: "If the customer pays exact change, just tap Confirm — you don't need to enter the amount.",
          },

          // ── 5. Credit sale ────────────────────────────────────────────────
          {
            id: "m-credit-sale", icon: "💳", title: "Credit Sales (Charge to Tab)", section: "Section 5",
            steps: [
              ["Tap Credit Sale", "Opens the customer selector from the cart."],
              ["Pick a customer", "Search by name or scroll the list. Tap the customer to select them."],
              ["Create a new customer on the spot", "Tap + New Account and fill in their name and contact details. They are saved immediately."],
              ["Confirm the charge", "The total is added to that customer's balance. No cash changes hands. The customer's tab is updated in real time."],
              ["Cash customer option", "You can also select Cash — Customer to record a cash payment against a credit account without adding to the balance."],
            ],
            tip: "Customers can pay off their tab from the Customers section. The balance owed is the authoritative figure maintained by the database — it accounts for all charge types.",
          },

          // ── 6. Bottles ────────────────────────────────────────────────────
          {
            id: "m-bottles", icon: "🥃", title: "Opened Bottles & Drink Sales", section: "Section 6",
            intro: "Sell individual shots from an open bottle without deducting a full bottle from stock.",
            steps: [
              ["Tap the 🥃 bottle icon on the Bar screen", "This opens the opened bottle selector."],
              ["Choose the liquor and shot size", "Select the product. Shot sizes and prices are configured per product in Items."],
              ["Add to cart", "The shot appears in the cart like any item. Sell it as cash or credit through the normal checkout."],
            ],
            tip: "Shot sales are tracked separately in the Summary for bottle revenue reporting.",
          },

          // ── 7. Packs ──────────────────────────────────────────────────────
          {
            id: "m-packs", icon: "🚬", title: "Cigarette & Rolling Paper Packs", section: "Section 7",
            intro: "Sell individual cigarettes or rolling papers from an open pack at a per-unit price.",
            steps: [
              ["Tap the 🚬 cigarette icon on the Bar screen", "Opens the retail unit selector."],
              ["Select the product and quantity", "Choose which pack type is open and how many singles to sell."],
              ["Add to cart and complete the sale", "Items appear in the cart and go through the normal cash or credit checkout."],
            ],
          },

          // ── 8. Specials ───────────────────────────────────────────────────
          {
            id: "m-specials", icon: "🎁", title: "Specials & Bundle Deals", section: "Section 8",
            intro: "Create promotions that sell multiple products together at one bundle price — e.g. \"Rum & Coke $25\".",
            steps: [
              ["Go to Specials in the menu", "Only owners can create and manage specials."],
              ["Create a new special", "Set the bundle name, bundle price, and which products are included in the deal."],
              ["Cashiers sell specials from the Bar", "Specials appear in the product grid under their own tab and are added to the cart like any other item."],
            ],
          },

          // ── 9. Discounts ──────────────────────────────────────────────────
          {
            id: "m-discount", icon: "🏷️", title: "Order Discounts", section: "Section 9",
            intro: "Apply a flat-dollar discount to the entire order total at checkout.",
            steps: [
              ["Build the order normally", "Add items to the cart as usual."],
              ["Tap the Discount icon", "On the cash or credit checkout screen, tap the discount field and enter the dollar amount to deduct."],
              ["Confirm", "The discount is applied to the total. The original price and discount amount are both recorded in the order history and wallet."],
            ],
            tip: "Discounts are visible in the wallet transaction history and on printed receipts so there is a clear audit trail.",
          },

          // ── 10. Edit order ────────────────────────────────────────────────
          {
            id: "m-edit-order", icon: "✏️", title: "Editing a Completed Order", section: "Section 10",
            intro: "Owners can edit a completed order directly from the wallet — useful for correcting mistakes without deleting and re-entering.",
            steps: [
              ["Open the Wallet", "Tap Wallet in the menu. Scroll to the order you need to fix."],
              ["Tap the pencil (edit) icon", "On the order row, tap the edit button. The order loads back into the Bar register with all original items."],
              ["Make your changes", "Add or remove items, adjust quantities, or update the total. Then complete the sale as normal."],
              ["Confirm the edit", "The original order is updated in-place. The wallet balance difference is applied automatically."],
            ],
            tip: "Editing is owner-only. Cashier edits are not permitted to maintain accountability.",
          },

          // ── 11. Products ──────────────────────────────────────────────────
          {
            id: "m-products", icon: "📦", title: "Items (Product Catalog)", section: "Section 11",
            steps: [
              ["Tap Items in the menu", "Owners and managers can view and edit products."],
              ["Add a product", "Tap the + button. Set the name, category, selling price, cost price, stock level, and optionally a photo."],
              ["Edit or delete", "Tap any product card to edit its details. Long-press to delete."],
              ["Stock deducts automatically", "Every confirmed sale reduces the stock count. A low-stock badge appears when levels fall below the threshold you set."],
              ["Cost price drives profit reporting", "Set an accurate cost price to see your gross margin per item in the Summary reports."],
            ],
            tip: "Use the category filter at the top of Items to quickly find products. Categories also appear as tabs on the Bar register.",
          },

          // ── 12. Stock count ───────────────────────────────────────────────
          {
            id: "m-stock", icon: "📋", title: "Stock Count", section: "Section 12",
            intro: "Manually verify and correct your stock levels at the end of a session or during a spot check.",
            steps: [
              ["Tap Stock Count in the menu", "Available to owners and managers."],
              ["Review current levels", "Each product shows its system stock level. Scroll through the full list."],
              ["Enter the physical count", "Tap any product and type the actual quantity you have on hand."],
              ["Save the count", "Tap Save. The system stock is updated to match your physical count. A variance note is recorded for the audit trail."],
              ["Download the sheet", "Tap the PDF / Export button to download a full stock count sheet for your records."],
            ],
            tip: "Run a stock count at the end of each session or week to keep your inventory accurate and your profit reports reliable.",
          },

          // ── 13. Wallet ────────────────────────────────────────────────────
          {
            id: "m-wallet", icon: "💰", title: "Wallet & Financial Overview", section: "Section 13",
            intro: "Every owner and cashier has a wallet. Cash sales credit the cashier's wallet. Managers record expenses against the bar. Owners can view all wallets and transfer balances.",
            steps: [
              ["View your balance and history", "Tap Wallet in the menu to see your running balance and full transaction list grouped by month."],
              ["Expand a month", "Tap any month row to see every individual sale, credit payment, transfer, and expense for that period."],
              ["Print or share an individual receipt", "On any order row, tap the receipt icon to open the receipt modal with Connect Printer and PDF / WhatsApp options."],
              ["Clear cashier wallets", "Owners go to Staff, select a cashier, and tap Clear to Owner to transfer their balance to the owner wallet."],
              ["Delete a record", "Owners can delete individual wallet entries from the transaction list. The balance is corrected automatically."],
            ],
          },

          // ── 14. Owner statement ───────────────────────────────────────────
          {
            id: "m-statement", icon: "📄", title: "Owner Statement", section: "Section 14",
            intro: "The Owner Statement is a full breakdown of every transaction recorded under the owner account, grouped by month.",
            steps: [
              ["Tap Statement in the Wallet", "Opens the Owner Statement modal."],
              ["Browse months", "Each month shows the total revenue. Tap to expand and see every individual record."],
              ["Order details", "Each order shows the date, time, items, paid amount, and change. Orders made by cashiers show a Cashier badge and the cashier's name. Manager-processed orders show a Manager badge."],
              ["Order numbers", "The order number (#) is shown on each record so you can cross-reference with receipts."],
              ["Download month PDF", "Tap the PDF download button next to any month to export that month's full statement as a PDF."],
            ],
          },

          // ── 15. Customers ─────────────────────────────────────────────────
          {
            id: "m-customers", icon: "👤", title: "Customers (Credit Accounts)", section: "Section 15",
            steps: [
              ["Go to Customers", "Tap Customers in the menu to see all open and closed credit accounts."],
              ["View balance and history", "Tap a customer card to expand their record. You'll see every charge and payment with dates and times."],
              ["Record a payment", "Tap Add Payment, enter the amount, and confirm. The balance updates immediately."],
              ["Print the full bill", "Tap Bill on any customer card to open the receipt modal showing their complete charge history and outstanding balance. From there you can print to a Bluetooth printer or share as a PDF via WhatsApp."],
              ["Print a single record", "Tap the printer icon on any individual charge or payment row to open the receipt modal for just that transaction."],
              ["Close an account", "Once a customer's balance is zero, they automatically move to the Closed tab."],
            ],
            tip: "The Balance Owed shown on the bill and in the app is maintained by the database — it correctly accounts for cash sales, credit charges, and payments.",
          },

          // ── 16. Receipts ──────────────────────────────────────────────────
          {
            id: "m-receipts", icon: "🖨️", title: "Printing & Sharing Receipts", section: "Section 16",
            intro: "Every sale, credit charge, and customer bill can be printed to a Bluetooth thermal printer or shared as a PDF via WhatsApp or email.",
            steps: [
              ["Tap the receipt / printer icon", "This appears on individual order rows in the Wallet, on credit transaction rows in Customers, and on the Bill button in the customer header."],
              ["The receipt modal opens", "A white receipt preview appears showing the business name, date, items, and totals."],
              ["Connect Printer", "On first use, tap Connect Printer. The app pairs with your Bluetooth thermal printer. The pairing is remembered for future sessions."],
              ["Print", "Once paired, tap Print to send the receipt to the printer."],
              ["PDF / WhatsApp", "Tap PDF / WhatsApp to download the receipt as a PDF or share it directly via WhatsApp or any share target."],
              ["Change printer", "If you need to switch printers, tap Change Printer at the bottom of the receipt modal to unpair and re-pair."],
            ],
            tip: "The receipt modal shows a full live preview of what will be printed before you commit.",
          },

          // ── 17. Cashiers ──────────────────────────────────────────────────
          {
            id: "m-cashiers", icon: "👥", title: "Staff (Cashiers)", section: "Section 17",
            steps: [
              ["Tap Staff in the menu", "Only the owner can manage staff accounts."],
              ["Add a cashier or manager", "Tap Add Staff, set a username, password, and role. They can sign in immediately."],
              ["View cashier wallet", "Tap any cashier card to see their current wallet balance and session history."],
              ["Clear wallet to owner", "Tap Clear to Owner to transfer the cashier's balance to your own wallet at the end of their shift."],
              ["Suspend a cashier", "Tap Suspend to block a cashier's access without deleting their account or history."],
            ],
            tip: "Cashiers only see the Bar register and their own wallet. They cannot access owner reports, product costs, or billing.",
          },

          // ── 18. Manager ───────────────────────────────────────────────────
          {
            id: "m-manager", icon: "📋", title: "Manager — Bar Expense", section: "Section 18",
            intro: "Managers record supply and operating costs — stock purchases, utilities, repairs — so they appear in the owner's financial reports.",
            steps: [
              ["Log in as manager", "Managers are created by the owner in Staff with the Manager role."],
              ["Open Bar Expense", "Tap Bar Expense in the menu to add a new expense with a description, category, and amount."],
              ["Expenses appear in Summary", "All manager-logged expenses are visible in the owner's Summary report under the Expenses section, correctly attributed to the session in which they were recorded."],
            ],
          },

          // ── 19. Summary ───────────────────────────────────────────────────
          {
            id: "m-summary", icon: "📊", title: "Summary Reports", section: "Section 19",
            intro: "Owners get a full financial picture — bar sales, items cost, gross profit, expenses, and net profit — for any selected date range.",
            steps: [
              ["Tap Summary in the menu", "Owner access only."],
              ["Choose a filter", "Select Day, Week, Month, Year, or Period. The Day filter defaults to today in Trinidad time."],
              ["Pick a date (Day filter)", "Tap the date picker to select any previous day. The summary updates automatically."],
              ["Read the figures", "Bar Sales is total revenue. Items Cost is the cost of goods sold. Gross Profit is the difference. Expenses are non-stock costs logged by managers. Net Profit = Gross Profit − Expenses."],
              ["Negative net profit", "If expenses exceed gross profit, net profit shows as a negative number (e.g. −$340). This is correct and expected."],
              ["Session count", "Below the date picker you'll see how many bar sessions overlapped the selected period."],
              ["Download PDF", "Tap PDF to export the full summary for the selected period."],
            ],
            tip: "The summary uses calendar-day boundaries in Trinidad time (UTC−4). All sales made between midnight and midnight local time on the selected day are included, regardless of which session they belong to.",
          },

          // ── 20. Music ─────────────────────────────────────────────────────
          {
            id: "m-music", icon: "🎵", title: "Music Player", section: "Section 20",
            intro: "Built-in YouTube music player — search and play songs for the bar without leaving the app.",
            steps: [
              ["Tap Music in the menu", "The music player opens with Playlist, Files, and YouTube tabs."],
              ["Search YouTube", "On the YouTube tab, type any song, artist, or playlist name and tap Search. You get up to 40 searches per day."],
              ["Play a track", "Tap any result to start playing. The track title appears in the mini player strip at the top."],
              ["Play / Pause without opening the player", "The mini now-playing bar has a Play/Pause button on the left. Tap it to pause or resume without leaving your current screen."],
              ["Stop the player", "Tap the Stop (square) button on the right of the mini bar to clear the player entirely."],
              ["Music keeps playing in the background", "Navigate back to the Bar or any other page — the audio continues. The mini bar remains visible on the Music page so you can control playback at a glance."],
              ["History", "Previously played tracks are saved in history and can be replayed. The player auto-advances to the next history track when a song ends."],
            ],
            tip: "The YouTube player uses a hidden iframe so audio continues even when the screen is not looking at the player.",
          },

          // ── 21. Profile ───────────────────────────────────────────────────
          {
            id: "m-profile", icon: "⚙️", title: "Profile & Settings", section: "Section 21",
            steps: [
              ["Tap Profile in the menu", "Update your bar name, contact details, and account information."],
              ["Change your password", "Enter your current password, then your new password and confirm it. Tap Save."],
              ["Language", "Switch the app between English and Spanish from the Language option in the menu."],
              ["Switch Bar (Chain plans)", "If your plan includes multiple bars, tap Switch Bar in the menu to move between them. Each bar has its own sessions, products, and reports."],
            ],
          },

          // ── 22. Billing ───────────────────────────────────────────────────
          {
            id: "m-billing", icon: "💳", title: "Billing & Subscription", section: "Section 22",
            intro: "Your subscription is managed by Bartendaz Pro. Plans are renewed annually.",
            steps: [
              ["Tap Billing in the menu", "See your current plan, expiry date, and subscription status."],
              ["Plan types", "Basic — full bar POS. Premium — bar POS with additional cashier limit. Chain — multi-bar management. Contact support to upgrade or change plans."],
              ["Expiry warning", "A banner appears when your plan is within 30 days of expiry. Renew before expiry to avoid service interruption."],
            ],
            tip: "Contact Renard at 375-5067 to renew or upgrade your plan.",
          },

          // ── 23. Offline ───────────────────────────────────────────────────
          {
            id: "m-offline", icon: "📡", title: "Offline Mode & Sync", section: "Section 23",
            intro: "Bartendaz Pro works offline for order taking. Sales are queued locally and synced automatically when the connection is restored.",
            steps: [
              ["Offline banner", "When the internet drops, a red banner appears at the top: \"No internet — orders will be saved locally\"."],
              ["Keep selling", "You can continue taking cash and credit orders. They are stored in a local queue on the device."],
              ["Automatic sync", "When the connection comes back, the app syncs all queued orders in sequence. The banner changes to green: \"Back online — syncing X records\"."],
              ["Sync count", "The banner shows how many records are waiting to sync so you always know the status."],
            ],
            warning: "Avoid closing the app while records are syncing. Wait for the green banner to disappear before closing.",
            tip: "Install the app as a PWA (Add to Home Screen in your browser) for faster load times and a native-app feel on any device.",
          },
        ].map((s: any) => (
          <Section key={s.id} {...s} />
        ))}

      </div>
    </div>
  );
}

function Section({ id, icon, title, section, intro, cards, steps, tip, warning }: {
  id: string; icon: string; title: string; section: string;
  intro?: string; cards?: { title: string; items: string[] }[];
  steps?: [string, string][]; tip?: string; warning?: string;
}) {
  return (
    <div
      id={id}
      style={{
        padding: "32px 0",
        borderBottom: "1px solid rgba(240,160,48,0.1)",
        scrollMarginTop: 60,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "rgba(240,160,48,0.12)", border: "1px solid rgba(240,160,48,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem",
        }}>
          {icon}
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#e8d5b0" }}>{title}</h3>
          <span style={{ fontSize: "0.75rem", color: "#F0A030", fontWeight: 700, opacity: 0.7 }}>{section}</span>
        </div>
      </div>

      {intro && (
        <p style={{ fontSize: "0.875rem", color: "#a08060", marginBottom: 16, lineHeight: 1.6 }}>{intro}</p>
      )}

      {cards && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          {cards.map(card => (
            <div key={card.title} style={{
              background: "rgba(240,160,48,0.06)", border: "1px solid rgba(240,160,48,0.15)",
              borderRadius: 14, padding: "14px 16px",
            }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", fontWeight: 900, color: "#F0A030" }}>{card.title}</h4>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {card.items.map(item => (
                  <li key={item} style={{ fontSize: "0.8rem", color: "#c8b090", marginBottom: 4, lineHeight: 1.4 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {steps && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: tip || warning ? 16 : 0 }}>
          {steps.map(([stepTitle, stepBody], i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,#F0A030,#C0441A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.75rem", fontWeight: 900, color: "#1a0a02",
              }}>
                {i + 1}
              </div>
              <div style={{ paddingTop: 4 }}>
                <h4 style={{ margin: "0 0 3px", fontSize: "0.875rem", fontWeight: 800, color: "#e8d5b0" }}>{stepTitle}</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#a08060", lineHeight: 1.55 }}>{stepBody}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {warning && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 12, padding: "12px 14px", marginBottom: tip ? 10 : 0,
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#f4a0a0", lineHeight: 1.55 }}>{warning}</p>
        </div>
      )}

      {tip && (
        <div style={{
          background: "rgba(240,160,48,0.07)", border: "1px solid rgba(240,160,48,0.2)",
          borderRadius: 12, padding: "12px 14px",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#c8a060", lineHeight: 1.55 }}>{tip}</p>
        </div>
      )}
    </div>
  );
}
