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

function copySanitizedTesseractBundle(source, destination) {
  let bundle = fs.readFileSync(source, 'utf8');
  bundle = bundle.replace(
    /Function\("r","regeneratorRuntime = r"\)\(([^)]+)\)/g,
    'globalThis.regeneratorRuntime=$1'
  );
  bundle = bundle.replace(
    /new Function\("return this"\)\(\)/g,
    'globalThis'
  );

  if (bundle.includes('new Function(') || bundle.includes('Function("r","regeneratorRuntime')) {
    throw new Error(`Tesseract bundle still contains dynamic code: ${source}`);
  }
  fs.writeFileSync(destination, bundle);
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

  if (browser === 'chromium') {
    manifest.manifest_version = 3;
    manifest.background = { service_worker: 'offline-background.js' };
    manifest.permissions = [...new Set([...(manifest.permissions || []), 'offscreen'])];
    manifest.content_security_policy = {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    };
    manifest.content_scripts = (manifest.content_scripts || []).map((contentScript) => ({
      ...contentScript,
      js: ['shortcut-listener.js']
    }));
    manifest.web_accessible_resources = [{
      resources: [
        'tesseract.min.js',
        'tesseract-worker.min.js',
        'tesseract-core.wasm.js',
        'tesseract-core.wasm',
        'tessdata/*',
        'chromium-ocr.html',
        'chromium-ocr.js',
        'capture.html',
        'capture.js'
      ],
      matches: ['<all_urls>']
    }];
  } else {
    manifest.manifest_version = 2;
    manifest.background = { scripts: ['tesseract.min.js', 'firefox-background.js'] };
    manifest.permissions = [...new Set([
      ...(manifest.permissions || []).filter((permission) => permission !== 'scripting'),
      '<all_urls>'
    ])];
    delete manifest.host_permissions;
    manifest.content_security_policy = "script-src 'self'; object-src 'self'; worker-src 'self';";
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
    manifest.web_accessible_resources = [
      'tesseract-worker.min.js',
      'tesseract-core.wasm.js',
      'tesseract-core.wasm',
      'tessdata/*',
      'capture.html',
      'capture.js',
      'raven-styles.css'
    ];
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.rmSync(path.join(outputDir, 'background.js'), { force: true });
  fs.rmSync(path.join(outputDir, 'chromium-background.js'), { force: true });

  if (browser === 'chromium') {
    // Preserve offline-background.js for Chromium service worker
    fs.rmSync(path.join(outputDir, 'firefox-background.js'), { force: true });
    copyFile(path.join(publicDir, 'chromium-ocr.html'), path.join(outputDir, 'chromium-ocr.html'));
    copyFile(path.join(publicDir, 'chromium-ocr.js'), path.join(outputDir, 'chromium-ocr.js'));
  } else {
    fs.rmSync(path.join(outputDir, 'offline-background.js'), { force: true });
    copyFile(path.join(publicDir, 'firefox-background.js'), path.join(outputDir, 'firefox-background.js'));
    fs.rmSync(path.join(outputDir, 'chromium-ocr.html'), { force: true });
    fs.rmSync(path.join(outputDir, 'chromium-ocr.js'), { force: true });
  }

  const popupPath = path.join(outputDir, 'popup.html');
  let popup = fs.readFileSync(popupPath, 'utf8');
  popup = popup.replace('data-ocr-mode="relay"', 'data-ocr-mode="offline"');
  popup = popup.replace('__RAVENEYE_VERSION__', version);
  fs.writeFileSync(popupPath, popup);

  // Sanitize Tesseract bundles for both browsers to eliminate dynamic code evaluation
  copySanitizedTesseractBundle(
    path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.js'),
    path.join(outputDir, 'tesseract.min.js')
  );
  copySanitizedTesseractBundle(
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

  // Integrity assertions
  const requiredFiles = browser === 'chromium'
    ? [
        'manifest.json',
        'offline-background.js',
        'chromium-ocr.html',
        'chromium-ocr.js',
        'capture.html',
        'capture.js',
        'content.js',
        'shortcut-listener.js',
        'popup.html',
        'popup.js',
        'raven-styles.css',
        'tesseract.min.js',
        'tesseract-worker.min.js',
        'tesseract-core.wasm.js',
        'tesseract-core.wasm',
        path.join('tessdata', 'eng.traineddata.gz'),
        path.join('icons', 'icon16.png'),
        path.join('icons', 'icon32.png'),
        path.join('icons', 'icon48.png'),
        path.join('icons', 'icon128.png')
      ]
    : [
        'manifest.json',
        'firefox-background.js',
        'capture.html',
        'capture.js',
        'content.js',
        'shortcut-listener.js',
        'popup.html',
        'popup.js',
        'raven-styles.css',
        'tesseract.min.js',
        'tesseract-worker.min.js',
        'tesseract-core.wasm.js',
        'tesseract-core.wasm',
        path.join('tessdata', 'eng.traineddata.gz'),
        path.join('icons', 'icon16.png'),
        path.join('icons', 'icon32.png'),
        path.join('icons', 'icon48.png'),
        path.join('icons', 'icon128.png')
      ];

  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(outputDir, rel))) {
      throw new Error(`[build-offline] Missing required file for ${browser}: ${rel}`);
    }
  }
}

console.log(`[build-offline] Chromium and Firefox bundles successfully prepared at ${outputRoot}`);
