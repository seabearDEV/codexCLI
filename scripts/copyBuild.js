const fs = require('fs');
const path = require('path');

/**
 * Build script that prepares the distribution files
 * - Verifies dist directory exists
 * - Removes non-JS files to keep only essential files
 * - Does NOT copy anything to ~/.codexcli (the application will create this at runtime)
 */

// Get the distribution directory path
const distDir = path.join(__dirname, '..', 'dist');

// Verify the dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Make sure TypeScript compilation succeeded.');
  process.exit(1);
}

// Clean up non-JS files
cleanNonJsFiles(distDir);

console.log('Build completed successfully!');

/**
 * Remove non-JS files from dist to keep only the essential files
 */
function cleanNonJsFiles(directory) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  
  files.forEach(file => {
    const filePath = path.join(directory, file.name);
    
    if (file.isDirectory()) {
      cleanNonJsFiles(filePath);
    } else if (path.extname(file.name) !== '.js') {
      // Remove non-JS files (source maps, declaration files, etc.)
      fs.unlinkSync(filePath);
    }
  });
}