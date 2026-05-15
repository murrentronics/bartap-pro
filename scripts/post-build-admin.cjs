const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'client');

// Check if index.html exists before renaming
const indexPath = path.join(distDir, 'index.html');
const adminPath = path.join(distDir, 'admin.html');

if (fs.existsSync(indexPath)) {
  fs.renameSync(indexPath, adminPath);
  console.log('✓ Renamed index.html to admin.html');
} else {
  console.log('⚠ index.html not found, skipping rename');
}

// Create simple index.html that redirects to download
fs.writeFileSync(
  path.join(distDir, 'index.html'),
  `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/download.html">
  <script>window.location.href = '/download.html';</script>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`
);

// Copy download.html
const downloadSrc = path.join(__dirname, '..', 'public', 'download.html');
const downloadDest = path.join(distDir, 'download.html');

if (fs.existsSync(downloadSrc)) {
  fs.copyFileSync(downloadSrc, downloadDest);
  console.log('✓ Copied download.html');
} else {
  console.log('⚠ download.html not found in public/');
}

// Create _redirects
fs.writeFileSync(
  path.join(distDir, '_redirects'),
  `/admin /admin.html 200
/admin/* /admin.html 200
/download /download.html 200
/* /download.html 200
`
);

console.log('✓ Post-build complete: admin.html, download.html, and redirects configured');
