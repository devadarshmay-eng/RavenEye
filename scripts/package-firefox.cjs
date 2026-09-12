const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sourceDir = path.join(root, 'dist-firefox');
const outputDir = path.join(root, 'dist-firefox-artifacts');
const zipName = `raveneye-v${pkg.version}-firefox.zip`;
const zipPath = path.join(outputDir, zipName);
const checksumPath = `${zipPath}.sha256`;

function run(command) {
  cp.execSync(command, { stdio: 'inherit' });
}

if (!fs.existsSync(sourceDir)) {
  throw new Error('[release:package:firefox] dist-firefox does not exist. Run npm run build:firefox first.');
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

if (os.platform() === 'win32') {
  const escapedSource = sourceDir.replace(/'/g, "''");
  const escapedDestination = zipPath.replace(/'/g, "''");
  let shell = 'pwsh';
  try {
    cp.execSync('pwsh -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', {
      stdio: 'ignore'
    });
  } catch {
    shell = 'powershell';
  }
  run(
    `${shell} -NoProfile -Command "Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -CompressionLevel Optimal -Force"`
  );
} else {
  const escapedSource = sourceDir.replace(/"/g, '\\"');
  const escapedDestination = zipPath.replace(/"/g, '\\"');
  run(`bash -lc "cd \\"${escapedSource}\\" && zip -r -X \\"${escapedDestination}\\" ."`); 
}

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(zipPath));
fs.writeFileSync(checksumPath, `${hash.digest('hex')}  ${zipName}\n`);

console.log(`[release:package:firefox] ZIP: ${zipPath}`);
console.log(`[release:package:firefox] SHA256: ${checksumPath}`);
