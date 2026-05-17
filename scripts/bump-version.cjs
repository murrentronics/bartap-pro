/**
 * bump-version.cjs
 *
 * Auto-increments the app version every time you run `npm run cap:sync`.
 *
 * What it updates:
 *   1. android/app/build.gradle  — versionCode (integer) and versionName (string)
 *   2. .env                      — VITE_APP_VERSION (read by the update checker at runtime)
 *
 * Strategy: bump the PATCH number (1.0.0 → 1.0.1 → 1.0.2 …)
 * and increment versionCode by 1 each time.
 *
 * To do a MINOR or MAJOR bump, just edit .env manually once:
 *   VITE_APP_VERSION="1.1.0"
 * The next cap:sync will then produce 1.1.1, 1.1.2, etc.
 */

const fs   = require("fs");
const path = require("path");

const ROOT        = path.resolve(__dirname, "..");
const ENV_FILE    = path.join(ROOT, ".env");
const GRADLE_FILE = path.join(ROOT, "android", "app", "build.gradle");

// ── 1. Read current version from .env ────────────────────────────────────────
const envContent = fs.readFileSync(ENV_FILE, "utf8");
const versionMatch = envContent.match(/^VITE_APP_VERSION="([^"]+)"/m);

if (!versionMatch) {
  console.error("❌  VITE_APP_VERSION not found in .env");
  process.exit(1);
}

const currentVersion = versionMatch[1]; // e.g. "1.0.4"
const parts = currentVersion.split(".").map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  console.error(`❌  VITE_APP_VERSION "${currentVersion}" is not valid semver (x.y.z)`);
  process.exit(1);
}

// Bump patch
parts[2] += 1;
const newVersion = parts.join(".");  // e.g. "1.0.5"

// ── 2. Read current versionCode from build.gradle ────────────────────────────
const gradleContent = fs.readFileSync(GRADLE_FILE, "utf8");
const codeMatch = gradleContent.match(/versionCode\s+(\d+)/);

if (!codeMatch) {
  console.error("❌  versionCode not found in android/app/build.gradle");
  process.exit(1);
}

const newVersionCode = parseInt(codeMatch[1], 10) + 1;

// ── 3. Write .env ─────────────────────────────────────────────────────────────
const newEnv = envContent.replace(
  /^VITE_APP_VERSION="[^"]+"/m,
  `VITE_APP_VERSION="${newVersion}"`
);
fs.writeFileSync(ENV_FILE, newEnv, "utf8");

// ── 4. Write build.gradle ─────────────────────────────────────────────────────
const newGradle = gradleContent
  .replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
fs.writeFileSync(GRADLE_FILE, newGradle, "utf8");

// ── 5. Done ───────────────────────────────────────────────────────────────────
console.log(`✅  Version bumped: ${currentVersion} → ${newVersion}  (versionCode ${newVersionCode})`);
console.log(`🏷️   GitHub Release tag to use: v${newVersion}`);
