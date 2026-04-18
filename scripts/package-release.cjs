const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const distExtension = path.join(root, 'dist-extension');
const outputDir = path.join(root, 'dist-artifacts');
const zipName = `raveneye-v${pkg.version}.zip`;
const zipPath = path.join(outputDir, zipName);
const checksumPath = `${zipPath}.sha256`;

function run(command) {
  cp.execSync(command, { stdio: 'inherit' });
}

if (!fs.existsSync(distExtension)) {
  throw new Error('[release:package] dist-extension does not exist. Run npm run build first.');
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(zipPath, { force: true });

if (os.platform() === 'win32') {
  const escapedSource = distExtension.replace(/'/g, "''");
  const escapedDestination = zipPath.replace(/'/g, "''");
  let shell = 'pwsh';
  try {
    cp.execSync('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', { stdio: 'ignore' });
  } catch {
    shell = 'powershell';
  }
  run(
    `${shell} -NoProfile -Command "Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -CompressionLevel Optimal -Force"`
  );
} else {
  const escapedSource = distExtension.replace(/"/g, '\\"');
  const escapedDestination = zipPath.replace(/"/g, '\\"');
  run(`bash -lc "cd \\"${escapedSource}\\" && zip -r -X \\"${escapedDestination}\\" ."`);
}

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(zipPath));
const digest = hash.digest('hex');
fs.writeFileSync(checksumPath, `${digest}  ${zipName}\n`);

console.log(`[release:package] ZIP: ${zipPath}`);
console.log(`[release:package] SHA256: ${checksumPath}`);
