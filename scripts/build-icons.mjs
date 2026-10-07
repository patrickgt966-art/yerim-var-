// Renders assets/brand/icon.svg into the PNGs app.json uses.
// App Store rejects icons with an alpha channel, so every output is
// flattened onto the brand navy and written as 3-channel RGB.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVY = '#0B3C49';
const src = await readFile(path.join(root, 'assets/brand/icon.svg'));

async function render(size, out) {
  await sharp(src, { density: 300 })
    .resize(size, size)
    .flatten({ background: NAVY })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, out));
  const meta = await sharp(path.join(root, out)).metadata();
  if (meta.hasAlpha || meta.channels !== 3) throw new Error(`${out} has alpha`);
  console.log(`${out}: ${meta.width}x${meta.height}, ${meta.channels} channels`);
}

// App icon (iOS needs a single 1024x1024; Xcode derives the rest).
await render(1024, 'assets/icon.png');
// Splash image: same mark, shown centered on a navy background (see app.json).
await render(1024, 'assets/splash-icon.png');
