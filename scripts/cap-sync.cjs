/**
 * cap-sync.cjs
 *
 * Capacitor needs dist/client/index.html to be the app entry point.
 * But for the website, index.html must be the download page.
 *
 * This script:
 *   1. Backs up the current index.html (download page)
 *   2. Copies index.capacitor.html → index.html  (app entry for cap sync)
 *   3. Runs:  npx cap sync android
 *   4. Restores index.html back to the download page
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const dist      = path.join(__dirname, '..', 'dist', 'client');
const appHtml   = path.join(dist, 'index.capacitor.html');
const indexHtml = path.join(dist, 'index.html');
const backupHtml = path.join(dist, 'index.download.html');

// 1. Backup download page
if (fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexHtml, backupHtml);
  console.log('✓ Backed up index.html (download page)');
}

// 2. Swap in the Capacitor app as index.html
if (!fs.existsSync(appHtml)) {
  console.error('✗ index.capacitor.html not found — run build:android first');
  process.exit(1);
}
fs.copyFileSync(appHtml, indexHtml);
console.log('✓ Swapped in index.capacitor.html as index.html for cap sync');

// 3. Run cap sync
try {
  execSync('npx cap sync android', { stdio: 'inherit' });
} finally {
  // 4. Always restore the download page, even if cap sync fails
  if (fs.existsSync(backupHtml)) {
    fs.copyFileSync(backupHtml, indexHtml);
    fs.unlinkSync(backupHtml);
    console.log('✓ Restored index.html to download page');
  }
}
