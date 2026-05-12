import { useEffect, useState } from "react";

// The logo SVG inline — amber/orange gradient B on dark background
function LogoMark({ size = 160 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="sp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0A030" />
          <stop offset="100%" stopColor="#C0441A" />
        </linearGradient>
        <radialGradient id="sp-bg" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#2E1A08" />
          <stop offset="100%" stopColor="#0F0A04" />
        </radialGradient>
      </defs>
      <circle cx="256" cy="256" r="256" fill="url(#sp-bg)" />
      <circle cx="256" cy="256" r="240" fill="none" stroke="#F0A030" strokeWidth="2" opacity="0.25" />
      <text
        x="256" y="340"
        fontFamily="Georgia, serif"
        fontSize="310"
        fontWeight="900"
        textAnchor="middle"
        fill="url(#sp-grad)"
      >B</text>
      <rect x="298" y="358" width="100" height="36" rx="12" fill="url(#sp-grad)" />
      <text
        x="348" y="382"
        fontFamily="Arial, sans-serif"
        fontSize="18"
        fontWeight="800"
        textAnchor="middle"
        fill="#1A0A02"
        letterSpacing="2"
      >PRO</text>
    </svg>
  );
}

// Arched "Welcome to" text drawn on an SVG arc
function ArchedText({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 320 120"
      width="320"
      height="120"
      style={{
        position: "absolute",
        top: "-60px",
        left: "50%",
        transform: "translateX(-50%)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s ease",
        pointerEvents: "none",
      }}
    >
      <defs>
        <path id="arc" d="M 20,100 A 140,140 0 0,1 300,100" />
      </defs>
      <text
        fontFamily="Georgia, serif"
        fontSize="22"
        fontWeight="700"
        fill="#F0A030"
        letterSpacing="3"
      >
        <textPath href="#arc" startOffset="50%" textAnchor="middle">
          Welcome to
        </textPath>
      </text>
    </svg>
  );
}

interface SplashScreenProps {
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  // Animation phases:
  // 0 → logo rolls in (0–0.8s)
  // 1 → "Welcome to" arched text fades in (0.8–1.4s)
  // 2 → "Bartendaz Pro" text slides up (1.4–2.0s)
  // 3 → loading bar fills 0→100% (2.0–4.5s)
  // 4 → fade out (4.5–5.0s)
  // done → unmount

  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1400);
    const t3 = setTimeout(() => setPhase(3), 2000);
    // Animate progress bar from 0 to 100 over 2500ms
    const t4 = setTimeout(() => {
      const start = Date.now();
      const duration = 2500;
      const tick = () => {
        const elapsed = Date.now() - start;
        const pct = Math.min(100, Math.round((elapsed / duration) * 100));
        setProgress(pct);
        if (pct < 100) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 2000);
    const t5 = setTimeout(() => setFadeOut(true), 4500);
    const t6 = setTimeout(() => onDone(), 5000);

    return () => { [t1, t2, t3, t4, t5, t6].forEach(clearTimeout); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.5s ease",
        // Safe area padding for notch devices
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Logo + arched text container */}
      <div style={{ position: "relative", marginBottom: "24px" }}>
        {/* Arched "Welcome to" */}
        <ArchedText visible={phase >= 1} />

        {/* Logo — rolls in from below with scale */}
        <div
          style={{
            transform: phase >= 0 ? "translateY(0) scale(1)" : "translateY(80px) scale(0.5)",
            opacity: phase >= 0 ? 1 : 0,
            transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease",
            marginTop: "60px",
          }}
        >
          <LogoMark size={180} />
        </div>
      </div>

      {/* "Bartendaz Pro" text */}
      <div
        style={{
          transform: phase >= 2 ? "translateY(0)" : "translateY(20px)",
          opacity: phase >= 2 ? 1 : 0,
          transition: "transform 0.6s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.5s ease",
          textAlign: "center",
          marginBottom: "48px",
        }}
      >
        <div
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "28px",
            fontWeight: "900",
            letterSpacing: "3px",
            background: "linear-gradient(135deg, #F0A030 0%, #C0441A 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          BARTENDAZ
        </div>
        <div
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: "13px",
            fontWeight: "700",
            letterSpacing: "8px",
            color: "#888",
            marginTop: "2px",
          }}
        >
          PRO
        </div>
      </div>

      {/* Loading bar */}
      <div
        style={{
          width: "220px",
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        {/* Track */}
        <div
          style={{
            width: "100%",
            height: "3px",
            background: "#222",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          {/* Fill */}
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #F0A030, #C0441A)",
              borderRadius: "2px",
              transition: "width 0.05s linear",
            }}
          />
        </div>
        {/* Percentage */}
        <div
          style={{
            textAlign: "center",
            marginTop: "8px",
            fontFamily: "Arial, sans-serif",
            fontSize: "11px",
            color: "#444",
            letterSpacing: "1px",
          }}
        >
          {progress}%
        </div>
      </div>
    </div>
  );
}
