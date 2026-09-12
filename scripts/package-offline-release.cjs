const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'dist-offline');
const outputDir = path.join(root, 'dist-artifacts');
const version = '2.0.0';

if (!fs.existsSync(sourceRoot)) {
  throw new Error('[release:package:offline] dist-offline does not exist. Run npm run build:offline first.');
}

fs.mkdirSync(outputDir, { recursive: true });

for (const browser of ['chromium', 'firefox']) {
  const source = path.join(sourceRoot, browser);
  const zipName = `raveneye-v${version}-${browser}.zip`;
  const zipPath = path.join(outputDir, zipName);
  fs.rmSync(zipPath, { force: true });

  if (process.platform === 'win32') {
    const shell = (() => {
      try {
        cp.execFileSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { stdio: 'ignore' });
        return 'pwsh';
      } catch {
        return 'powershell';
      }
    })();
    const escape = (value) => value.replace(/'/g, "''");
    cp.execFileSync(shell, [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${escape(source)}\\*' -DestinationPath '${escape(zipPath)}' -CompressionLevel Optimal -Force`
    ], { stdio: 'inherit' });
  } else {
    cp.execFileSync('zip', ['-r', '-X', zipPath, '.'], { cwd: source, stdio: 'inherit' });
  }

  const digest = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  fs.writeFileSync(`${zipPath}.sha256`, `${digest}  ${zipName}\n`);
  console.log(`[release:package:offline] ${zipPath}`);
}
