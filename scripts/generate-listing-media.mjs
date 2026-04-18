import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist-media');

function fileUrl(fileName) {
  const absolute = path.join(root, fileName).replace(/\\/g, '/');
  return `file:///${absolute}`;
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const targets = [
  { name: 'docs-home', url: fileUrl('raveneye-docs.html') },
  { name: 'privacy-policy', url: fileUrl('privacy-policy.html') }
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 }
});

try {
  const page = await context.newPage();
  for (const target of targets) {
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(outputDir, `${target.name}.png`),
      fullPage: true
    });
    console.log(`[release:media] Created ${target.name}.png`);
  }
} finally {
  await context.close();
  await browser.close();
}
