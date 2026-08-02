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
        margin: "0 -12px", // bleed to edges under app layout padding
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
            The complete guide to running your bar — from opening the session to closing the night, every feature explained step by step.
          </p>
        </div>

        {/* TOC */}
        <div style={{ padding: "28px 0", borderBottom: "1px solid rgba(240,160,48,0.12)" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 900, color: "#F0A030", marginBottom: 14 }}>Table of Contents</h3>
          <ol style={{ paddingLeft: 20, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "6px 24px" }}>
            {[
              ["#m-login","Signing In & Account Roles"],
              ["#m-session","Opening & Closing the Bar Session"],
              ["#m-pos","Bar (POS) — Taking Orders"],
              ["#m-cash","Cash Sales & Change"],
              ["#m-credit","Credit Sales (Charge to Tab)"],
              ["#m-bottles","Opened Bottles & Drink Sales"],
              ["#m-packs","Cigarette & Rolling Paper Packs"],
              ["#m-specials","Specials & Bundle Deals"],
              ["#m-products","Items (Product Catalog)"],
              ["#m-wallet","Wallet & Financial Overview"],
              ["#m-customers","Customers (Credit Accounts)"],
              ["#m-cashiers","Staff (Cashiers)"],
              ["#m-manager","Manager — Bar Expense"],
              ["#m-machines","Machines Tracker"],
              ["#m-music","Music Player"],
              ["#m-summary","Summary Reports"],
              ["#m-profile","Profile & Settings"],
              ["#m-offline","Offline Mode & Sync"],
            ].map(([href, label], i) => (
              <li key={href} style={{ fontSize: "0.85rem", marginBottom: 2 }}>
                <a href={href} style={{ color: "#F0A030", textDecoration: "none" }} onClick={e => {
                  e.preventDefault();
                  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                  {i + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* Sections */}
        {[
          {
            id: "m-login", icon: "🔐", title: "Signing In & Account Roles", section: "Section 1",
            cards: [
              { title: "👑 Owner", items: ["Full access to all features","Manage staff, products, wallet","View all reports and history","Billing and plan management"] },
              { title: "🧑‍💼 Cashier", items: ["Take orders at the register","Cash and credit sales","View own wallet balance","No access to owner settings"] },
              { title: "📋 Manager", items: ["Record bar expenses","View items and customers","Access machines tracker","No billing or staff management"] },
            ],
            steps: [
              ["Go to the app URL","Open Bartendaz Pro in your browser or via the installed APK."],
              ["Enter your username and password","Owners register an account first. Cashiers and managers are created by the owner inside the app."],
              ["You'll land on your role's home screen","Owners and cashiers go to the Bar register. Managers go to Items."],
            ],
            tip: "Forgot your password? Use the Forgot Password link on the login page to reset via email.",
          },
          {
            id: "m-session", icon: "🕐", title: "Opening & Closing the Bar Session", section: "Section 2",
            intro: "Each day starts with opening the session and ends with closing it. Cashier wallets are tracked per session.",
            steps: [
              ["Open the Bar tab","Tap Bar in the menu. If no session is open you'll see the Open Session button."],
              ["Set the cashier float","Enter the starting cash amount for the session, then confirm to open."],
              ["Start selling","Once open, cashiers can take orders immediately. All sales are logged in real time."],
              ["Close the session (owner)","At end of day the owner closes the session from the header button or Wallet page. This locks the session totals."],
            ],
          },
          {
            id: "m-pos", icon: "🍺", title: "Bar (POS) — Taking Orders", section: "Section 3",
            steps: [
              ["Tap items to add to cart","Browse by category tabs at the top. Tap any product to add one unit to the cart."],
              ["Adjust quantities","Long-press an item in the cart to change its quantity or remove it."],
              ["Choose cash or credit","Tap Cash Sale or Credit Sale to proceed to checkout."],
            ],
            tip: "Sort items by long-pressing the product grid to enter sort mode. Tap an item then tap another to swap positions.",
          },
          {
            id: "m-cash", icon: "💵", title: "Cash Sales & Change", section: "Section 4",
            steps: [
              ["Tap Cash Sale","After building the order, tap the Cash Sale button at the bottom of the cart."],
              ["Enter amount tendered","Type in the amount the customer gives you. The app calculates change instantly."],
              ["Confirm the sale","Tap Confirm. The sale is recorded and the cashier wallet is updated."],
            ],
          },
          {
            id: "m-credit", icon: "💳", title: "Credit Sales (Charge to Tab)", section: "Section 5",
            steps: [
              ["Tap Credit Sale","Select Credit Sale from the cart. You'll be prompted to choose a customer."],
              ["Select or create a customer","Search existing credit accounts or tap + New Account to create one on the spot."],
              ["Confirm charge","The amount is added to that customer's outstanding balance. No cash changes hands."],
            ],
            tip: "Customers can pay off their tab later from the Customers section. Tap a customer then Add Payment.",
          },
          {
            id: "m-bottles", icon: "🥃", title: "Opened Bottles & Drink Sales", section: "Section 6",
            intro: "Sell individual shots from an opened bottle of liquor without reducing stock on the full-bottle product.",
            steps: [
              ["Tap the 🥃 bottle icon","On the Bar screen, tap the Shot from Bottle button to open the bottle selector."],
              ["Choose a liquor product","Select the open bottle. The shot price is set per product in your Items catalog."],
              ["Add to order","Tap Add Shot. It appears in the cart like any other item and can be sold as cash or credit."],
            ],
          },
          {
            id: "m-packs", icon: "🚬", title: "Cigarette & Rolling Paper Packs", section: "Section 7",
            intro: "Sell individual cigarettes or papers from an open pack without tracking as a full-unit sale.",
            steps: [
              ["Tap the 🚬 cigarette icon","This opens the retail cigarette/paper selector on the Bar screen."],
              ["Select the product and quantity","Choose which pack is open and how many singles to sell."],
              ["Add to order and complete sale","Items appear in the cart and go through the normal cash/credit checkout."],
            ],
          },
          {
            id: "m-specials", icon: "🎁", title: "Specials & Bundle Deals", section: "Section 8",
            intro: "Create deals that combine multiple products at a single bundle price — e.g. \"Rum & Coke $25\".",
            steps: [
              ["Go to Specials","Owners tap Specials in the menu to manage deals."],
              ["Create a new special","Name the deal, set the bundle price, and add the products it includes."],
              ["Cashiers sell specials from the Bar","Specials appear in the product grid and are added to the cart like any item."],
            ],
          },
          {
            id: "m-products", icon: "📦", title: "Items (Product Catalog)", section: "Section 9",
            steps: [
              ["Tap Items in the menu","Only owners and managers can access this section."],
              ["Add or edit a product","Set the name, category, selling price, cost price, and stock level. Optionally add a photo."],
              ["Stock is tracked automatically","Every confirmed sale deducts from stock. You'll see a low-stock indicator when levels drop."],
            ],
            tip: "Set a cost price to see your profit margin per product in the Summary report.",
          },
          {
            id: "m-wallet", icon: "💰", title: "Wallet & Financial Overview", section: "Section 10",
            intro: "Every owner and cashier has a wallet. Cash sales go to the cashier's wallet. Owners can transfer funds to their own wallet.",
            steps: [
              ["View balance and records","Tap Wallet in the menu to see your running balance and full transaction history."],
              ["Clear cashier wallets","Owners go to Staff, select a cashier, and tap Clear to Owner to transfer their balance."],
              ["Download statement","Tap Statement in the wallet to generate a PDF of all transactions."],
            ],
          },
          {
            id: "m-customers", icon: "👤", title: "Customers (Credit Accounts)", section: "Section 11",
            steps: [
              ["Go to Customers","Tap Customers in the menu to see all credit accounts."],
              ["View balance and history","Tap a customer to see their full charge and payment history, current balance, and contact info."],
              ["Record a payment","Tap Add Payment, enter the amount, and confirm. The balance updates immediately."],
              ["Download a bill","Tap Bill to generate a PDF statement to share with the customer."],
            ],
          },
          {
            id: "m-cashiers", icon: "👥", title: "Staff (Cashiers)", section: "Section 12",
            steps: [
              ["Tap Staff in the menu","Only the owner can manage staff accounts."],
              ["Add a cashier","Tap Add Cashier, set a username and password. They can log in immediately."],
              ["Clear or suspend a cashier","Tap a cashier card to transfer their wallet balance to the owner or suspend their access."],
            ],
            tip: "Cashiers only see the Bar register and their own wallet. They cannot access owner settings, reports, or products.",
          },
          {
            id: "m-manager", icon: "📋", title: "Manager — Bar Expense", section: "Section 13",
            intro: "The Manager role is for recording bar supply expenses — stock purchases, utilities, and other costs.",
            steps: [
              ["Log in as manager","Managers are created by the owner in the Staff section with job title set to Manager."],
              ["Open Bar Expense","Tap Bar Expense in the menu to record a new expense with category, amount, and note."],
              ["Owner reviews in Summary","All manager-logged expenses appear in the owner's Summary report under the Expenses tab."],
            ],
          },
          {
            id: "m-machines", icon: "🎰", title: "Machines Tracker", section: "Section 14",
            intro: "Available on Machines Only and Bar with Machines plans. Track payouts, income, and profit per gaming machine.",
            steps: [
              ["Create your machines","Tap Machines then the + icon to add each machine with a name."],
              ["Set a float","Before recording payouts, tap a machine and set the opening float amount for the session."],
              ["Record payouts and income","Log each payout to players and income loaded into the machine. The app calculates net profit."],
              ["Export session PDF","Tap the PDF icon to download a full session report for any machine."],
            ],
          },
          {
            id: "m-music", icon: "🎵", title: "Music Player", section: "Section 15",
            intro: "Built-in YouTube music player — search and queue songs for the bar without leaving the app.",
            steps: [
              ["Tap Music in the menu","The music player opens. Search YouTube for any song or playlist."],
              ["Queue tracks","Tap a result to play it. Previous tracks are saved in history so you can replay them."],
              ["Music keeps playing while you work","Navigate back to the Bar or any other page — music continues in the background."],
            ],
          },
          {
            id: "m-summary", icon: "📊", title: "Summary Reports", section: "Section 16",
            intro: "Owners get a full financial overview — sales, expenses, profits, and cashier breakdowns.",
            steps: [
              ["Tap Summary","Available to owners only. Shows totals for the current and previous sessions."],
              ["Filter by date range","Use the date pickers to see data for any custom period."],
              ["Download PDF","Tap the download icon to export the full summary report as a PDF."],
            ],
          },
          {
            id: "m-profile", icon: "⚙️", title: "Profile & Settings", section: "Section 17",
            steps: [
              ["Tap Profile","Update your bar name, contact details, and change your password."],
              ["Change password","Enter your current password, then your new password and confirm it."],
              ["Language","Switch the app between English and Spanish from the Language option in the menu."],
            ],
          },
          {
            id: "m-offline", icon: "📡", title: "Offline Mode & Sync", section: "Section 18",
            intro: "Bartendaz Pro requires an internet connection for all real-time features.",
            warning: "No offline mode for the web version. Sales, wallets, and reports all require an active connection. Use a stable Wi-Fi or mobile data connection at your bar.",
            tip: "Install the app as a PWA (Add to Home Screen in your browser) for a native-app feel and faster load times.",
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

      {/* Role cards */}
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

      {/* Steps */}
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

      {/* Warning */}
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

      {/* Tip */}
      {tip && (
        <div style={{
          background: "rgba(240,160,48,0.07)", border: "1px solid rgba(240,160,48,0.2)",
          borderRadius: 12, padding: "12px 14px",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#c8b080", lineHeight: 1.55 }}>{tip}</p>
        </div>
      )}
    </div>
  );
}
