const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, 'dist-extension');
const packagePath = path.join(root, 'package.json');
const manifestPath = path.join(publicDir, 'manifest.json');

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

if (!fs.existsSync(publicDir)) {
  throw new Error('public directory is missing. Cannot build extension package.');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[build-extension] Synced manifest version to ${pkg.version}`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
copyDir(publicDir, outputDir);

for (const fileName of ['popup-backup.html', 'popup-backup.js', 'setup.html']) {
  removeIfExists(path.join(outputDir, fileName));
}

const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'raven-styles.css',
  path.join('icons', 'icon16.png'),
  path.join('icons', 'icon32.png'),
  path.join('icons', 'icon48.png'),
  path.join('icons', 'icon128.png')
];

const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(outputDir, relativePath)));
if (missing.length) {
  throw new Error(`[build-extension] Missing required files: ${missing.join(', ')}`);
}

console.log(`[build-extension] Extension package prepared at ${outputDir}`);
