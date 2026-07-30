// ── Diagnostic: check what URLs are in template_images ──────────────────
// Run with: node check-templates.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vavfsgbrfpvolskscolf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM4NzI0MCwiZXhwIjoyMDkzOTYzMjQwfQ.2HEaTNHuyGd6cJRfNLsEfiiFPdVajy9V-USib4vzFLQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from("template_images")
    .select("id, url, label, category")
    .limit(10);

  if (error) {
    console.error("❌ DB error:", error.message);
    return;
  }

  console.log(`\nFirst 10 template rows:\n`);
  for (const row of data) {
    console.log(`  Label:    ${row.label}`);
    console.log(`  Category: ${row.category}`);
    console.log(`  URL:      ${row.url}`);

    // Try to fetch the URL
    try {
      const res = await fetch(row.url, { signal: AbortSignal.timeout(8000) });
      console.log(`  Status:   ${res.status} ${res.ok ? "✅" : "❌"}`);
    } catch (e) {
      console.log(`  Status:   ❌ ${e.message}`);
    }
    console.log();
  }
}

main();
