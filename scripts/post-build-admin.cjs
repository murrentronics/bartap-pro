const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'client');

// Rename index.html to admin.html is NOT needed
// Just keep index.html as the admin app

console.log('✓ Admin build complete: index.html serves admin app at root');

