#!/usr/bin/env node

/**
 * Script to generate PWA icons from SVG source
 *
 * Prerequisites:
 *   npm install sharp --save-dev
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../public/icons');
const SVG_SOURCE = path.join(ICONS_DIR, 'icon.svg');

// Standard PWA icon sizes
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Maskable icon sizes (with padding for safe zone)
const MASKABLE_SIZES = [192, 512];

async function generateIcons() {
  console.log('Generating PWA icons from SVG...\n');

  // Ensure icons directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // Read SVG source
  const svgBuffer = fs.readFileSync(SVG_SOURCE);

  // Generate standard icons
  for (const size of SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${outputPath}`);
  }

  // Generate maskable icons (with extra padding for safe zone)
  for (const size of MASKABLE_SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-maskable-${size}x${size}.png`);
    // For maskable icons, the safe zone is 80% of the icon
    // We resize the icon to 80% and add padding
    const iconSize = Math.floor(size * 0.8);
    const padding = Math.floor((size - iconSize) / 2);

    await sharp(svgBuffer)
      .resize(iconSize, iconSize)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 249, g: 115, b: 22, alpha: 1 } // orange-500
      })
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${outputPath} (maskable)`);
  }

  // Generate favicon (32x32)
  const faviconPath = path.join(__dirname, '../public/favicon.ico');
  await sharp(svgBuffer)
    .resize(32, 32)
    .toFormat('png')
    .toFile(path.join(ICONS_DIR, 'favicon-32x32.png'));
  console.log(`✓ Generated favicon-32x32.png`);

  // Generate 16x16 favicon
  await sharp(svgBuffer)
    .resize(16, 16)
    .toFormat('png')
    .toFile(path.join(ICONS_DIR, 'favicon-16x16.png'));
  console.log(`✓ Generated favicon-16x16.png`);

  // Generate Apple Touch Icon (180x180)
  const appleTouchPath = path.join(__dirname, '../public/apple-touch-icon.png');
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log(`✓ Generated apple-touch-icon.png`);

  // Generate OG image (1200x630)
  const ogImagePath = path.join(__dirname, '../public/og-image.png');
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 } // slate-900
    }
  })
    .composite([
      {
        input: await sharp(svgBuffer).resize(300, 300).toBuffer(),
        top: 165,
        left: 450
      }
    ])
    .png()
    .toFile(ogImagePath);
  console.log(`✓ Generated og-image.png`);

  console.log('\n✅ All icons generated successfully!');
  console.log('\nNote: For favicon.ico, you may want to use a tool like');
  console.log('https://realfavicongenerator.net/ for better browser compatibility.');
}

generateIcons().catch(console.error);
