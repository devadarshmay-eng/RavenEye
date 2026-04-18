const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outputDir = path.join(root, 'dist-marketing');
const mediaDir = path.join(root, 'dist-media');
const docsUrl = 'https://devadarshmay-eng.github.io/RavenEye/raveneye-docs.html';
const privacyUrl = 'https://devadarshmay-eng.github.io/RavenEye/privacy-policy.html';

function run(command) {
  return cp.execSync(command, { cwd: root, encoding: 'utf8' }).trim();
}

function tryRun(command, fallback = '') {
  try {
    return run(command);
  } catch {
    return fallback;
  }
}

const recentCommits = tryRun('git --no-pager log --pretty=format:"- %s" -n 7', '- Update and improvements');
const releaseTag = `v${pkg.version}`;

const xPost = [
  `RavenEye ${releaseTag} is live for Microsoft Edge Add-ons.`,
  '',
  'Capture any region in-browser and extract text instantly with OCR.',
  'Highlights:',
  '- keyboard shortcut + popup launch',
  '- fast selection overlay',
  '- one-click copy of OCR output',
  '',
  `Docs: ${docsUrl}`,
  `Privacy: ${privacyUrl}`,
  '#RavenEye #MicrosoftEdge #OCR #Productivity'
].join('\n');

const releaseNotes = [
  `# RavenEye ${releaseTag} launch bundle`,
  '',
  '## Suggested X post',
  '```text',
  xPost,
  '```',
  '',
  '## Recent commit highlights',
  recentCommits || '- Update and improvements'
].join('\n');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'x-post.txt'), `${xPost}\n`);
fs.writeFileSync(path.join(outputDir, 'release-notes.md'), `${releaseNotes}\n`);

const mediaFiles = fs.existsSync(mediaDir)
  ? fs.readdirSync(mediaDir).filter((name) => name.toLowerCase().endsWith('.png'))
  : [];

const manifest = {
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  docsUrl,
  privacyUrl,
  mediaFiles,
  files: ['x-post.txt', 'release-notes.md']
};

fs.writeFileSync(path.join(outputDir, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[release:marketing] Created launch bundle at ${outputDir}`);
