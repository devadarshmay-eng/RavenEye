/**
 * RavenEye - Icon Generator
 * Regenerates extension/store icons from public/icons/logo-master.png.
 * Run: node scripts/generate-icons.cjs
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128, 300];
const outputDir = path.join(__dirname, '..', 'public', 'icons');
const sourceLogoPath = path.join(outputDir, 'logo-master.png');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

if (!fs.existsSync(sourceLogoPath)) {
  throw new Error(`Source logo is missing: ${sourceLogoPath}`);
}

async function generateIcons() {
  const source = await loadImage(sourceLogoPath);
  const cropSize = Math.min(source.width, source.height);
  const sourceX = Math.floor((source.width - cropSize) / 2);
  const sourceY = Math.floor((source.height - cropSize) / 2);

  sizes.forEach((size) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      source,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      size,
      size
    );

    const outPath = path.join(outputDir, `icon${size}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    console.log(`✅  Generated ${outPath} (${size}x${size})`);
  });

  console.log('\nAll icons generated from logo-master.png.');
}

generateIcons().catch((error) => {
  console.error(`[generate-icons] ${error.message}`);
  process.exit(1);
});
