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

    // Background: dark gradient
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(1, '#0f3460');
    ctx.fillStyle = bg;

    // Rounded rect background
    const r = size * 0.18;
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

    const cx = size / 2;
    const cy = size / 2;
    const eyeR = size * 0.30; // outer eye ellipse radius

    // Draw outer eye shape (white)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeR, eyeR * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw iris
    const irisR = eyeR * 0.52;
    const irisGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, irisR);
    irisGrad.addColorStop(0, '#7c3aed');
    irisGrad.addColorStop(1, '#4f46e5');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fill();

    // Draw pupil
    ctx.fillStyle = '#0f0f1a';
    ctx.beginPath();
    ctx.arc(cx, cy, irisR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Highlight glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(cx + irisR * 0.25, cy - irisR * 0.25, irisR * 0.2, 0, Math.PI * 2);
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
