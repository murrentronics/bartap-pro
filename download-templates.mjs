// ── Download all template images from Supabase to your PC ──────────────────
// Run with: node download-templates.mjs

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SUPABASE_URL = "https://vavfsgbrfpvolskscolf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM4NzI0MCwiZXhwIjoyMDkzOTYzMjQwfQ.2HEaTNHuyGd6cJRfNLsEfiiFPdVajy9V-USib4vzFLQ";

const OUTPUT_DIR = "C:\\Users\\Trecia\\Downloads\\template-images";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Sanitize label for use as a filename
function safeFilename(label, index, ext) {
  const clean = label
    .replace(/[<>:"/\\|?*]+/g, "")   // strip invalid Windows chars
    .replace(/\s+/g, "_")             // spaces → underscores
    .slice(0, 80)                     // max length
    .trim();
  return `${String(index + 1).padStart(4, "0")}_${clean || "image"}${ext}`;
}

// Download a URL using fetch (built into Node 18+)
async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buffer);
}

async function main() {
  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`\n📁 Saving to: ${OUTPUT_DIR}\n`);

  // Fetch all template rows
  const { data: templates, error } = await supabase
    .from("template_images")
    .select("id, url, label, category")
    .order("category", { ascending: true })
    .order("label",    { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch templates:", error.message);
    process.exit(1);
  }

  console.log(`Found ${templates.length} template images\n`);

  let success = 0;
  let failed  = 0;

  for (let i = 0; i < templates.length; i++) {
    const { url, label, category } = templates[i];

    // Skip placeholder/manual entries with no real URL
    if (!url || url.startsWith("manual:")) {
      console.log(`  ⚠️  Skipping (no image): ${label}`);
      failed++;
      continue;
    }

    // Determine extension from URL
    const rawExt = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
    const ext = ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(rawExt)
      ? `.${rawExt}`
      : ".jpg";

    // Create category subfolder
    const catDir = join(OUTPUT_DIR, category || "other");
    mkdirSync(catDir, { recursive: true });

    const filename = safeFilename(label, i, ext);
    const destPath = join(catDir, filename);

    process.stdout.write(`  [${i + 1}/${templates.length}] ${label} ... `);

    try {
      await downloadFile(url, destPath);
      console.log("✅");
      success++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ Downloaded: ${success}`);
  console.log(`❌ Failed:     ${failed}`);
  console.log(`📁 Location:   ${OUTPUT_DIR}`);
  console.log(`─────────────────────────────────────\n`);
}

main();
