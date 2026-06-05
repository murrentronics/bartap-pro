/**
 * Returns a user-friendly error message.
 * Detects offline / network failures and returns a clean "No internet" message
 * instead of raw Supabase/fetch error strings.
 */
export function friendlyError(err: unknown): string {
  // Check navigator.onLine first
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "No internet connection. Please connect to Wi-Fi or mobile data and try again.";
  }

  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : "Something went wrong. Please try again.";

  const lower = msg.toLowerCase();

  // Network / fetch failure patterns
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("net::err") ||
    lower.includes("the internet connection appears to be offline")
  ) {
    return "No internet connection. Please connect to Wi-Fi or mobile data and try again.";
  }

  // Auth errors — make them readable
  if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
    return "Incorrect username or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Account not verified. Check your email.";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return msg;
}
