const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'client');

// Rename index.html to admin.html
fs.renameSync(
  path.join(distDir, 'index.html'),
  path.join(distDir, 'admin.html')
);

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
fs.copyFileSync(
  path.join(__dirname, '..', 'public', 'download.html'),
  path.join(distDir, 'download.html')
);

// Create _redirects
fs.writeFileSync(
  path.join(distDir, '_redirects'),
  `/admin /admin.html 200
/admin/* /admin.html 200
`
);

console.log('✓ Post-build complete: admin.html, download.html, and redirects configured');
