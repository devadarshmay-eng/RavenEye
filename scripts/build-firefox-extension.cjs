const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, 'dist-firefox');
const packagePath = path.join(root, 'package.json');
const sourceManifestPath = path.join(publicDir, 'manifest.json');

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
  throw new Error('public directory is missing. Cannot build Firefox extension package.');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
}

// Firefox MV3 does not use Chrome's service_worker background entry.
manifest.background = {
  scripts: ['background.js']
};
manifest.browser_specific_settings = {
  gecko: {
    id: 'raveneye@devadarshmay-eng.github.io',
    strict_min_version: '109.0'
  }
};

fs.rmSync(outputDir, { recursive: true, force: true });
copyDir(publicDir, outputDir);
fs.writeFileSync(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

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
  'shortcut-listener.js',
  path.join('icons', 'icon16.png'),
  path.join('icons', 'icon32.png'),
  path.join('icons', 'icon48.png'),
  path.join('icons', 'icon128.png')
];

const missing = requiredFiles.filter(
  (relativePath) => !fs.existsSync(path.join(outputDir, relativePath))
);
if (missing.length) {
  throw new Error(`[build-firefox-extension] Missing required files: ${missing.join(', ')}`);
}

console.log(`[build-firefox-extension] Firefox package prepared at ${outputDir}`);
