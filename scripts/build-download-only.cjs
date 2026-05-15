const fs = require('fs');
const path = require('path');

// Create dist/client directory
const distDir = path.join(__dirname, '..', 'dist', 'client');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy download.html as index.html
const downloadSrc = path.join(__dirname, '..', 'public', 'download.html');
const indexDest = path.join(distDir, 'index.html');

if (fs.existsSync(downloadSrc)) {
  fs.copyFileSync(downloadSrc, indexDest);
  console.log('✓ Copied download.html as index.html');
} else {
  console.error('✗ download.html not found in public/');
  process.exit(1);
}

// Copy assets folder if it exists
const assetsSrc = path.join(__dirname, '..', 'public', 'assets');
const assetsDest = path.join(distDir, 'assets');

if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDest, { recursive: true });
  console.log('✓ Copied assets folder');
}

// Create simple _redirects
fs.writeFileSync(
  path.join(distDir, '_redirects'),
  `/* /index.html 200
`
);

console.log('✓ Build complete: Download page only');
