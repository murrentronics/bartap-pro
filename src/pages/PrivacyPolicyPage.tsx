import { useNavigate } from "react-router-dom";
import { ShieldCheck, FileText, ArrowLeft } from "lucide-react";

const S = {
  page: { fontFamily: "Arial, sans-serif", color: "#e8d5b0", background: "#0a0600", minHeight: "100vh", margin: "0 -12px" } as React.CSSProperties,
  sticky: { position: "sticky", top: 0, zIndex: 20, background: "#0f0a04", borderBottom: "1px solid rgba(240,160,48,0.15)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties,
  title: { fontSize: "1.05rem", fontWeight: 900, background: "linear-gradient(135deg, #F0A030, #C0441A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } as React.CSSProperties,
  wrap: { maxWidth: 820, margin: "0 auto", padding: "24px 20px 80px" } as React.CSSProperties,
  h2: { fontSize: "1.5rem", fontWeight: 900, color: "#F0A030", margin: "0 0 6px" } as React.CSSProperties,
  sub: { fontSize: "0.82rem", color: "#a08060", marginBottom: 28 } as React.CSSProperties,
  h3: { fontSize: "1rem", fontWeight: 900, color: "#F0A030", margin: "28px 0 8px" } as React.CSSProperties,
  p: { fontSize: "0.88rem", color: "#c8b090", lineHeight: 1.75, margin: "0 0 12px" } as React.CSSProperties,
  ul: { paddingLeft: 20, margin: "0 0 12px" } as React.CSSProperties,
  li: { fontSize: "0.88rem", color: "#c8b090", lineHeight: 1.75, marginBottom: 4 } as React.CSSProperties,
  divider: { borderColor: "rgba(240,160,48,0.12)", margin: "28px 0" } as React.CSSProperties,
  card: { background: "rgba(240,160,48,0.07)", border: "1px solid rgba(240,160,48,0.18)", borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 } as React.CSSProperties,
};

export default function PrivacyPolicyPage() {
  const nav = useNavigate();

  return (
    <div style={S.page}>
      {/* Sticky header */}
      <div style={S.sticky}>
        <button onClick={() => nav(-1)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#F0A030", flexShrink: 0 }}>
          <ArrowLeft size={16} />
        </button>
        <ShieldCheck size={20} color="#F0A030" />
        <span style={S.title}>Privacy Policy</span>
      </div>

      <div style={S.wrap}>
        {/* Cover */}
        <div style={{ textAlign: "center", padding: "32px 0 28px", borderBottom: "1px solid rgba(240,160,48,0.12)", marginBottom: 28 }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔒</div>
          <h2 style={S.h2}>Privacy Policy</h2>
          <p style={{ ...S.sub, marginBottom: 0 }}>Bartendaz Pro · Last updated: August 2026</p>
        </div>

        <p style={S.p}>
          Bartendaz Pro ("we", "us", or "our") is committed to protecting the personal information of our users. This Privacy Policy explains what data we collect, how we use it, and the choices you have.
        </p>

        <h3 style={S.h3}>1. Information We Collect</h3>
        <ul style={S.ul}>
          <li style={S.li}><strong>Account information</strong> — business name, email address, phone number, and billing address provided during registration.</li>
          <li style={S.li}><strong>Usage data</strong> — sales records, stock levels, expense entries, session timestamps, and machine float data generated while using the app.</li>
          <li style={S.li}><strong>Device data</strong> — device type, operating system, and app version for diagnostics and push notifications.</li>
          <li style={S.li}><strong>Payment records</strong> — subscription payments processed through our billing system (no card numbers are stored on our servers).</li>
        </ul>

        <h3 style={S.h3}>2. How We Use Your Information</h3>
        <ul style={S.ul}>
          <li style={S.li}>To provide, maintain, and improve the Bartendaz Pro service.</li>
          <li style={S.li}>To process subscription payments and send renewal reminders.</li>
          <li style={S.li}>To send important service notifications and security alerts.</li>
          <li style={S.li}>To generate analytics and reports within your account dashboard.</li>
          <li style={S.li}>To troubleshoot technical issues and respond to support requests.</li>
        </ul>

        <h3 style={S.h3}>3. Data Storage & Security</h3>
        <p style={S.p}>
          Your data is stored securely on Supabase-hosted servers with industry-standard encryption at rest and in transit (TLS 1.2+). Access is controlled by row-level security policies so that each account can only access its own data.
        </p>

        <h3 style={S.h3}>4. Data Sharing</h3>
        <p style={S.p}>
          We do <strong>not</strong> sell, rent, or trade your personal information to third parties. We may share data with:
        </p>
        <ul style={S.ul}>
          <li style={S.li}><strong>Service providers</strong> — Supabase (database &amp; auth), Cloudflare (CDN &amp; DNS), and payment processors, solely to operate the platform.</li>
          <li style={S.li}><strong>Legal obligations</strong> — if required by law, court order, or governmental authority.</li>
        </ul>

        <h3 style={S.h3}>5. Data Retention</h3>
        <p style={S.p}>
          Account data is retained for as long as your account is active. When you cancel your subscription and request deletion, your data is removed within 30 days except where retention is required by law.
        </p>

        <h3 style={S.h3}>6. Your Rights</h3>
        <ul style={S.ul}>
          <li style={S.li}>Access and download a copy of your data at any time.</li>
          <li style={S.li}>Request correction of inaccurate personal information.</li>
          <li style={S.li}>Request deletion of your account and associated data.</li>
          <li style={S.li}>Opt out of non-essential communications.</li>
        </ul>

        <h3 style={S.h3}>7. Cookies & Local Storage</h3>
        <p style={S.p}>
          Bartendaz Pro stores authentication tokens and offline-mode data in your device's local storage. No third-party advertising cookies are used.
        </p>

        <h3 style={S.h3}>8. Children's Privacy</h3>
        <p style={S.p}>
          Bartendaz Pro is intended for business use by adults. We do not knowingly collect information from anyone under the age of 18.
        </p>

        <h3 style={S.h3}>9. Changes to This Policy</h3>
        <p style={S.p}>
          We may update this Privacy Policy periodically. Changes will be posted within the app and the "Last updated" date will be revised. Continued use of the app after changes constitutes acceptance of the updated policy.
        </p>

        <h3 style={S.h3}>10. Contact Us</h3>
        <p style={S.p}>
          For privacy-related questions or data requests, contact us at <span style={{ color: "#F0A030" }}>support@bartendazpro.com</span>.
        </p>

        <hr style={S.divider} />

        {/* Links to terms pages */}
        <p style={{ ...S.p, marginBottom: 16, fontWeight: 700, color: "#e8d5b0" }}>Related Legal Documents</p>
        <div
          style={S.card}
          onClick={() => nav("/terms?tab=conditions")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && nav("/terms?tab=conditions")}
          className="cursor-pointer active:scale-[0.98] transition-transform"
        >
          <FileText size={22} color="#F0A030" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "#e8d5b0", marginBottom: 4 }}>Terms &amp; Conditions</div>
            <div style={{ fontSize: "0.82rem", color: "#a08060" }}>Rules governing the use of the Bartendaz Pro platform, subscription terms, and account responsibilities.</div>
          </div>
        </div>
        <div
          style={S.card}
          onClick={() => nav("/terms?tab=use")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && nav("/terms?tab=use")}
          className="cursor-pointer active:scale-[0.98] transition-transform"
        >
          <FileText size={22} color="#F0A030" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "#e8d5b0", marginBottom: 4 }}>Terms of Use</div>
            <div style={{ fontSize: "0.82rem", color: "#a08060" }}>Acceptable use, prohibited conduct, and your rights and obligations when using the app.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
