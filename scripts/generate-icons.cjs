/**
 * RavenEye - Icon Generator
 * Generates proper PNG icons at the required sizes for Chrome extensions.
 * Run: node scripts/generate-icons.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 128];
const outputDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function drawIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background: premium dark gradient
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(0.5, '#1f2a5f');
    bg.addColorStop(1, '#4b2ca0');
    ctx.fillStyle = bg;

    // Rounded squircle background
    const r = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // Soft vignette for depth
    const vignette = ctx.createRadialGradient(size * 0.5, size * 0.35, size * 0.15, size * 0.5, size * 0.5, size * 0.7);
    vignette.addColorStop(0, 'rgba(255,255,255,0.12)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const eyeR = size * 0.31;

    // Outer eye stroke
    ctx.strokeStyle = 'rgba(236, 242, 255, 0.92)';
    ctx.lineWidth = Math.max(1, size * 0.058);
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeR, eyeR * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Iris
    const irisR = eyeR * 0.54;
    const irisGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, irisR);
    irisGrad.addColorStop(0, '#8b5cf6');
    irisGrad.addColorStop(0.65, '#5b5ff7');
    irisGrad.addColorStop(1, '#312e81');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#080a14';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // Raven-style accent slash
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - irisR * 0.7, cy + irisR * 0.45);
    ctx.lineTo(cx + irisR * 0.75, cy - irisR * 0.58);
    ctx.stroke();

    // Highlight glints
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx + irisR * 0.28, cy - irisR * 0.30, irisR * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(cx - irisR * 0.36, cy + irisR * 0.18, irisR * 0.1, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
}

sizes.forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    const outPath = path.join(outputDir, `icon${size}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`✅  Generated ${outPath} (${size}x${size})`);
});

console.log('\nAll icons generated!');
