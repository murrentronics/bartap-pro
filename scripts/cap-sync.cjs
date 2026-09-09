/**
 * cap-sync.cjs
 * Temporarily swaps index.html to the Capacitor app for cap sync,
 * then ALWAYS restores it to the web app index — even on error or crash.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const dist       = path.join(__dirname, '..', 'dist', 'client');
const appHtml    = path.join(dist, 'index.capacitor.html');
const indexHtml  = path.join(dist, 'index.html');
const webHtml    = path.join(__dirname, '..', 'dist', 'web', 'index.html');

// Restore function — puts the web app index back after cap sync
function restore() {
  try {
    if (fs.existsSync(webHtml)) {
      fs.copyFileSync(webHtml, indexHtml);
      console.log('✓ Restored index.html to web app');
    } else {
      // Fallback: copy the capacitor html back (better than nothing)
      fs.copyFileSync(appHtml, indexHtml);
      console.log('✓ Restored index.html (capacitor fallback)');
    }
  } catch (e) {
    console.error('✗ Failed to restore index.html:', e.message);
  }
}

// Register restore on ANY exit — crash, error, or normal
process.on('exit', restore);
process.on('SIGINT',  () => process.exit(1));
process.on('SIGTERM', () => process.exit(1));
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });

// Validate
if (!fs.existsSync(appHtml)) {
  console.error('✗ index.capacitor.html not found — run build:android first');
  process.exit(1);
}

// Swap in the Capacitor app
fs.copyFileSync(appHtml, indexHtml);
console.log('✓ Swapped in index.capacitor.html for cap sync');

// Run cap sync — restore happens via process.on('exit') no matter what
execSync('npx cap sync android', { stdio: 'inherit' });
