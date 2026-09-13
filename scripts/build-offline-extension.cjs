const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const outputRoot = path.join(root, 'dist-offline');
const packagePath = path.join(root, 'package.json');

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = pkg.version;
if (!fs.existsSync(publicDir)) throw new Error('public directory is missing.');

fs.rmSync(outputRoot, { recursive: true, force: true });

for (const browser of ['chromium', 'firefox']) {
  const outputDir = path.join(outputRoot, browser);
  copyDir(publicDir, outputDir);

  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  manifest.description = 'Capture screen regions and extract text locally with private, offline OCR.';
  manifest.background = browser === 'firefox'
    ? { scripts: ['tesseract.min.js', 'firefox-background.js'] }
    : { service_worker: 'offline-background.js' };
  if (browser === 'chromium') {
    manifest.permissions = [...new Set([...(manifest.permissions || []), 'offscreen'])];
    manifest.content_scripts = (manifest.content_scripts || []).map((contentScript) => ({
      ...contentScript,
      js: ['shortcut-listener.js', ...(contentScript.js || [])
        .filter((file) => !['content.js', 'chromium-content.js', 'tesseract.min.js', 'shortcut-listener.js'].includes(file))]
    }));
  }
  manifest.web_accessible_resources = browser === 'firefox'
    ? ['tesseract-worker.min.js', 'tesseract-core.wasm.js', 'tesseract-core.wasm', 'tessdata/*']
    : [{
        resources: ['tesseract-worker.min.js', 'tesseract-core.wasm.js', 'tesseract-core.wasm', 'tessdata/*'],
        matches: ['<all_urls>']
      }];

  if (browser === 'firefox') {
    manifest.manifest_version = 2;
    manifest.permissions = [...new Set([
      ...(manifest.permissions || []).filter((permission) => permission !== 'scripting'),
      '<all_urls>'
    ])];
    delete manifest.host_permissions;
    delete manifest.content_security_policy;
    manifest.browser_action = manifest.action;
    delete manifest.action;
    manifest.browser_specific_settings = {
      gecko: {
        id: 'raveneye@devadarshmay-eng.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none']
        }
      }
    };
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.rmSync(path.join(outputDir, 'background.js'), { force: true });
  fs.rmSync(path.join(outputDir, 'chromium-background.js'), { force: true });
  fs.rmSync(path.join(outputDir, 'offline-background.js'), { force: true });
  if (browser === 'chromium') {
    copyFile(path.join(publicDir, 'chromium-ocr.html'), path.join(outputDir, 'chromium-ocr.html'));
    copyFile(path.join(publicDir, 'chromium-ocr.js'), path.join(outputDir, 'chromium-ocr.js'));
  } else {
    copyFile(path.join(publicDir, 'firefox-background.js'), path.join(outputDir, 'firefox-background.js'));
    fs.rmSync(path.join(outputDir, 'chromium-ocr.html'), { force: true });
    fs.rmSync(path.join(outputDir, 'chromium-ocr.js'), { force: true });
  }

  const popupPath = path.join(outputDir, 'popup.html');
  let popup = fs.readFileSync(popupPath, 'utf8');
  popup = popup.replace('data-ocr-mode="relay"', 'data-ocr-mode="offline"');
  popup = popup.replace('__RAVENEYE_VERSION__', version);
  fs.writeFileSync(popupPath, popup);

  copyFile(
    path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.js'),
    path.join(outputDir, 'tesseract.min.js')
  );
  copyFile(
    path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    path.join(outputDir, 'tesseract-worker.min.js')
  );
  copyFile(
    path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js'),
    path.join(outputDir, 'tesseract-core.wasm.js')
  );
  copyFile(
    path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'),
    path.join(outputDir, 'tesseract-core.wasm')
  );
  copyFile(
    path.join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
    path.join(outputDir, 'tessdata', 'eng.traineddata.gz')
  );

  for (const fileName of ['popup-backup.html', 'popup-backup.js', 'setup.html']) {
    fs.rmSync(path.join(outputDir, fileName), { force: true });
  }
}

console.log(`[build-offline] Chromium and Firefox bundles prepared at ${outputRoot}`);
