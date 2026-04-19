#!/usr/bin/env node
// Generates placeholder "T" icons in build/ for electron-builder.
// Run: npm run icons
// Output files are committed; this script is for regeneration only.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');

fs.mkdirSync(buildDir, { recursive: true });

const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const png2icons = require('png2icons');

const SIZE = 1024;

// SVG "T" on dark background
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1e1e1e"/>
  <text
    x="50%" y="54%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-weight="bold"
    font-size="${Math.round(SIZE * 0.72)}"
    fill="#e0e0e0"
  >T</text>
</svg>`;

const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');
const icnsPath = path.join(buildDir, 'icon.icns');

console.log('Generating icon.png …');
await sharp(Buffer.from(svg)).png().toFile(pngPath);

console.log('Generating icon.ico …');
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuffers = await Promise.all(
  icoSizes.map((s) =>
    sharp(Buffer.from(svg)).resize(s, s).png().toBuffer()
  )
);
const icoData = await pngToIco(icoBuffers);
fs.writeFileSync(icoPath, icoData);

console.log('Generating icon.icns …');
const png1024 = fs.readFileSync(pngPath);
const icnsData = png2icons.createICNS(png1024, png2icons.BILINEAR, 0);
if (!icnsData) throw new Error('png2icons returned null — check input PNG');
fs.writeFileSync(icnsPath, icnsData);

console.log('Done. Icons written to build/');
