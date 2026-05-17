/**
 * PhoneInput
 *
 * Shows "+1 868" as a static prefix (never editable, never stored).
 * The user types exactly 7 digits — auto-hyphen inserted after digit 3.
 * Format displayed: XXX-XXXX
 * Value stored:     +1868XXXXXXX  (passed to onChange)
 *
 * Props:
 *   value      — the full stored value e.g. "+18685551234" or "" 
 *   onChange   — called with the full value "+1868XXXXXXX" or "" when cleared
 *   required   — standard html required
 *   id / name  — forwarded to the input
 */

import { useRef } from "react";

interface PhoneInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (fullValue: string) => void;
  required?: boolean;
}

const PREFIX = "+1 868";
const COUNTRY_CODE = "+1868"; // stored prefix, no space

/** Strip everything except digits from a string */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Format 7 raw digits as XXX-XXXX */
function formatLocal(digits: string): string {
  const d = digits.slice(0, 7);
  if (d.length <= 3) return d;
  return d.slice(0, 3) + "-" + d.slice(3);
}

/** Extract the 7 local digits from a stored full value like "+18685551234" */
function extractLocal(fullValue: string): string {
  if (!fullValue) return "";
  // Strip the country code prefix digits (1868 = 4 digits)
  const allDigits = digitsOnly(fullValue);
  // If it starts with 1868, strip those 4 digits
  if (allDigits.startsWith("1868")) return allDigits.slice(4, 11);
  // Otherwise just take last 7
  return allDigits.slice(-7);
}

export function PhoneInput({ id, name, value, onChange, required }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive the display value (formatted local digits) from the stored full value
  const localDigits = extractLocal(value);
  const displayValue = formatLocal(localDigits);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip everything except digits
    const digits = digitsOnly(raw).slice(0, 7);
    // Build the full stored value
    const full = digits.length > 0 ? COUNTRY_CODE + digits : "";
    onChange(full);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow: backspace, delete, tab, escape, arrows, home, end
    const allowed = ["Backspace", "Delete", "Tab", "Escape", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (allowed.includes(e.key)) return;
    // Block anything that isn't a digit
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
    // Block if already at 7 digits (accounting for the hyphen in display)
    const currentDigits = digitsOnly(displayValue);
    if (currentDigits.length >= 7 && /^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div className="flex rounded-md overflow-hidden border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 bg-background">
      {/* Static prefix — not an input, just display */}
      <span className="flex items-center px-3 bg-muted text-muted-foreground text-sm font-semibold border-r border-input select-none whitespace-nowrap">
        {PREFIX}
      </span>
      {/* 7-digit local number input */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="tel-local"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="XXX-XXXX"
        required={required}
        maxLength={8} /* 7 digits + 1 hyphen */
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}
