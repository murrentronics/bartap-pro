/**
 * Custom confirm dialog — replaces window.confirm() throughout the app.
 * Works on Android (no browser dialogs) and web.
 *
 * Usage:
 *   const confirmed = await confirm({ title: "Delete?", description: "Cannot be undone." });
 *   if (confirmed) { ... }
 */

import { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

// ─── Imperative confirm() function ───────────────────────────────────────────
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = (result: boolean) => {
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(<ConfirmModal {...opts} onResult={cleanup} />);
  });
}

// ─── Modal component ──────────────────────────────────────────────────────────
function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onResult,
}: ConfirmOptions & { onResult: (r: boolean) => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => onResult(false)}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <h2 className="text-lg font-black leading-tight pr-4">{title}</h2>
          <button
            onClick={() => onResult(false)}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition shrink-0 mt-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {description && (
          <p className="px-5 pb-4 text-sm text-muted-foreground">{description}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 px-5 pb-5">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => onResult(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            className={`flex-1 h-11 font-black ${destructive ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`}
            style={!destructive ? { background: "var(--gradient-hero)", color: "var(--primary-foreground)" } : {}}
            onClick={() => onResult(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook version (for use inside React components) ───────────────────────────
export function useConfirm() {
  return useCallback((opts: ConfirmOptions) => confirm(opts), []);
}
