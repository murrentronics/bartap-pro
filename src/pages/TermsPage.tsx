import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { FileText, ArrowLeft } from "lucide-react";

const S = {
  page: { fontFamily: "Arial, sans-serif", color: "#e8d5b0", background: "#0a0600", minHeight: "100vh", margin: "0 -12px" } as React.CSSProperties,
  sticky: { position: "sticky", top: 0, zIndex: 20, background: "#0f0a04", borderBottom: "1px solid rgba(240,160,48,0.15)", padding: "14px 20px" } as React.CSSProperties,
  title: { fontSize: "1.05rem", fontWeight: 900, background: "linear-gradient(135deg, #F0A030, #C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } as React.CSSProperties,
  wrap: { maxWidth: 820, margin: "0 auto", padding: "24px 20px 80px" } as React.CSSProperties,
  h2: { fontSize: "1.5rem", fontWeight: 900, color: "#F0A030", margin: "0 0 6px" } as React.CSSProperties,
  sub: { fontSize: "0.82rem", color: "#a08060", marginBottom: 0 } as React.CSSProperties,
  h3: { fontSize: "1rem", fontWeight: 900, color: "#F0A030", margin: "28px 0 8px" } as React.CSSProperties,
  p: { fontSize: "0.88rem", color: "#c8b090", lineHeight: 1.75, margin: "0 0 12px" } as React.CSSProperties,
  ul: { paddingLeft: 20, margin: "0 0 12px" } as React.CSSProperties,
  li: { fontSize: "0.88rem", color: "#c8b090", lineHeight: 1.75, marginBottom: 4 } as React.CSSProperties,
  divider: { borderColor: "rgba(240,160,48,0.12)", margin: "32px 0" } as React.CSSProperties,
  tabBtn: (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 40,
    borderRadius: 10,
    fontWeight: 900,
    fontSize: "0.85rem",
    border: "none",
    cursor: "pointer",
    transition: "all 0.15s",
    background: active ? "linear-gradient(135deg, #F0A030, #C0441A)" : "rgba(255,255,255,0.06)",
    color: active ? "#fff" : "#a08060",
  }),
};

function TermsOfConditions() {
  return (
    <>
      <div style={{ textAlign: "center", padding: "32px 0 28px", borderBottom: "1px solid rgba(240,160,48,0.12)", marginBottom: 28 }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>📋</div>
        <h2 style={S.h2}>Terms &amp; Conditions</h2>
        <p style={S.sub}>Bartendaz Pro · Last updated: August 2026</p>
      </div>

      <p style={S.p}>
        By creating an account or using Bartendaz Pro, you agree to be bound by these Terms and Conditions. Please read them carefully before using the platform.
      </p>

      <h3 style={S.h3}>1. Acceptance of Terms</h3>
      <p style={S.p}>
        These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("Owner", "User") and Bartendaz Pro ("we", "us", "our"). Accessing or using the app constitutes full acceptance of these Terms.
      </p>

      <h3 style={S.h3}>2. Account Registration</h3>
      <ul style={S.ul}>
        <li style={S.li}>You must provide accurate, complete, and current information during registration.</li>
        <li style={S.li}>You are responsible for maintaining the confidentiality of your login credentials.</li>
        <li style={S.li}>You are responsible for all activity that occurs under your account, including actions taken by cashiers and managers you create.</li>
        <li style={S.li}>You must notify us immediately of any unauthorized use of your account.</li>
      </ul>

      <h3 style={S.h3}>3. Subscription & Billing</h3>
      <ul style={S.ul}>
        <li style={S.li}>Access to Bartendaz Pro requires a paid subscription. Plans and pricing are published within the app.</li>
        <li style={S.li}>Subscriptions are billed on a recurring basis (monthly or annually) as selected at signup.</li>
        <li style={S.li}>Failure to renew results in account suspension. Data is retained for 30 days after expiry before deletion.</li>
        <li style={S.li}>Add-ons (Machines Tracker, Multi-Bar, Chain of Bars) are billed separately and activated upon payment confirmation by an admin.</li>
        <li style={S.li}>All payments are final. Refunds are issued at our sole discretion for documented technical failures on our end.</li>
      </ul>

      <h3 style={S.h3}>4. Permitted Use</h3>
      <p style={S.p}>
        Bartendaz Pro is licensed solely for use as a bar and hospitality point-of-sale management tool for legitimate business operations. You may not:
      </p>
      <ul style={S.ul}>
        <li style={S.li}>Resell, sublicense, or redistribute the platform or its content.</li>
        <li style={S.li}>Reverse engineer, decompile, or attempt to extract source code.</li>
        <li style={S.li}>Use the platform to process illegal transactions or operate an unlicensed business.</li>
        <li style={S.li}>Attempt to circumvent security measures or access other users' data.</li>
      </ul>

      <h3 style={S.h3}>5. Staff Accounts</h3>
      <p style={S.p}>
        As an Owner you may create Cashier and Manager accounts. You accept full responsibility for the actions of your staff within the platform. Bartendaz Pro is not liable for losses arising from staff misuse of their accounts.
      </p>

      <h3 style={S.h3}>6. Data Ownership</h3>
      <p style={S.p}>
        You retain full ownership of the business data you enter into Bartendaz Pro (products, sales, customers, expenses). We do not claim any rights over your data. We process it solely to deliver the service as described in our Privacy Policy.
      </p>

      <h3 style={S.h3}>7. Service Availability</h3>
      <p style={S.p}>
        We strive for 99.5% uptime but do not guarantee uninterrupted service. Planned maintenance will be communicated in advance where possible. We are not liable for losses arising from downtime outside of our reasonable control.
      </p>

      <h3 style={S.h3}>8. Limitation of Liability</h3>
      <p style={S.p}>
        To the maximum extent permitted by law, Bartendaz Pro shall not be liable for any indirect, incidental, special, consequential, or punitive damages — including lost profits, lost revenue, or loss of data — arising from your use or inability to use the platform.
      </p>

      <h3 style={S.h3}>9. Termination</h3>
      <p style={S.p}>
        We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or fail to maintain an active subscription. You may cancel your account at any time from the Billing page.
      </p>

      <h3 style={S.h3}>10. Governing Law</h3>
      <p style={S.p}>
        These Terms are governed by the laws of Trinidad and Tobago. Any disputes shall be resolved in the courts of Trinidad and Tobago.
      </p>

      <h3 style={S.h3}>11. Changes to These Terms</h3>
      <p style={S.p}>
        We may revise these Terms at any time. Continued use of the platform after changes are published constitutes acceptance of the updated Terms.
      </p>

      <h3 style={S.h3}>12. Contact</h3>
      <p style={S.p}>
        Questions about these Terms? Email us at <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span>.
      </p>
    </>
  );
}

function TermsOfUse() {
  return (
    <>
      <div style={{ textAlign: "center", padding: "32px 0 28px", borderBottom: "1px solid rgba(240,160,48,0.12)", marginBottom: 28 }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>📜</div>
        <h2 style={S.h2}>Terms of Use</h2>
        <p style={S.sub}>Bartendaz Pro · Last updated: August 2026</p>
      </div>

      <p style={S.p}>
        These Terms of Use govern your day-to-day interaction with the Bartendaz Pro app, including acceptable conduct, prohibited activities, and your rights as a user.
      </p>

      <h3 style={S.h3}>1. Acceptable Use</h3>
      <p style={S.p}>You agree to use Bartendaz Pro only for lawful purposes and in a manner consistent with all applicable local, national, and international laws and regulations. You must:</p>
      <ul style={S.ul}>
        <li style={S.li}>Ensure your business is licensed to operate and sell the products you manage in the app.</li>
        <li style={S.li}>Enter accurate product prices, costs, and stock quantities.</li>
        <li style={S.li}>Maintain appropriate access controls for your staff accounts.</li>
        <li style={S.li}>Keep your account credentials secure and not share your owner login.</li>
      </ul>

      <h3 style={S.h3}>2. Prohibited Conduct</h3>
      <p style={S.p}>You must not use Bartendaz Pro to:</p>
      <ul style={S.ul}>
        <li style={S.li}>Conduct or facilitate any illegal transactions or money laundering.</li>
        <li style={S.li}>Record false financial data with intent to defraud customers, staff, or authorities.</li>
        <li style={S.li}>Harass, impersonate, or harm other users of the platform.</li>
        <li style={S.li}>Upload malicious software, scripts, or content that could damage the platform or other users' devices.</li>
        <li style={S.li}>Attempt to gain unauthorized access to other accounts or system infrastructure.</li>
        <li style={S.li}>Scrape, harvest, or systematically extract data from the platform without written permission.</li>
      </ul>

      <h3 style={S.h3}>3. Content You Submit</h3>
      <p style={S.p}>
        You are solely responsible for all product images, names, prices, customer data, and other content you upload or enter. By submitting content you confirm you have the rights to use it and that it does not violate any third-party intellectual property rights.
      </p>

      <h3 style={S.h3}>4. Intellectual Property</h3>
      <p style={S.p}>
        All software, design, graphics, trademarks, and content comprising Bartendaz Pro are the exclusive property of Bartendaz Pro or its licensors. Nothing in these Terms grants you any rights in our intellectual property other than the limited license to use the platform as described.
      </p>

      <h3 style={S.h3}>5. Third-Party Services</h3>
      <p style={S.p}>
        Bartendaz Pro integrates with third-party services (Supabase, YouTube, push notification providers). Your use of those integrations is subject to the respective providers' terms of service. We are not responsible for the availability or conduct of third-party services.
      </p>

      <h3 style={S.h3}>6. Offline Mode</h3>
      <p style={S.p}>
        The app supports offline operation and local data caching. You accept that data entered offline will sync when connectivity is restored, and you take responsibility for ensuring sync completes successfully.
      </p>

      <h3 style={S.h3}>7. Reporting Violations</h3>
      <p style={S.p}>
        If you become aware of any violation of these Terms, please report it to <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span>. We take violations seriously and will investigate all reports.
      </p>

      <h3 style={S.h3}>8. Enforcement</h3>
      <p style={S.p}>
        We reserve the right to investigate any suspected violation and take appropriate action, including issuing warnings, suspending features, or terminating accounts without notice where necessary to protect the platform and its users.
      </p>

      <h3 style={S.h3}>9. Disclaimer of Warranties</h3>
      <p style={S.p}>
        Bartendaz Pro is provided "as is" and "as available" without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the app will be error-free or uninterrupted.
      </p>

      <h3 style={S.h3}>10. Contact</h3>
      <p style={S.p}>
        For questions about these Terms of Use, contact <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span>.
      </p>
    </>
  );
}

export default function TermsPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState<"conditions" | "use">("conditions");

  // Respect ?tab= query param (used by PrivacyPolicyPage links)
  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const t = params.get("tab");
    if (t === "use") setTab("use");
    else setTab("conditions");
  }, [loc.search]);

  return (
    <div style={S.page}>
      {/* Sticky header */}
      <div style={S.sticky}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => nav(-1)}
            style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#F0A030", flexShrink: 0 }}
          >
            <ArrowLeft size={16} />
          </button>
          <FileText size={20} color="#F0A030" />
          <span style={S.title}>{tab === "conditions" ? "Terms & Conditions" : "Terms of Use"}</span>
        </div>
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.tabBtn(tab === "conditions")} onClick={() => setTab("conditions")}>Terms &amp; Conditions</button>
          <button style={S.tabBtn(tab === "use")} onClick={() => setTab("use")}>Terms of Use</button>
        </div>
      </div>

      <div style={S.wrap}>
        {tab === "conditions" ? <TermsOfConditions /> : <TermsOfUse />}
      </div>
    </div>
  );
}
