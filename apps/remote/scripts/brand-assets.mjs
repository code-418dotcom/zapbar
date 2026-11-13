// Regenerates the launcher icon and splash PNGs from the Z path. Run: pnpm brand
import sharp from 'sharp';

const LIME = '#C8F552';
const FOREST = '#17301B';
const Z = 'M27 30H73L27 70H73';
const OUT = new URL('../assets/', import.meta.url).pathname;

// scale < 1 shrinks the Z inside the square (adaptive icons need it inside the centre 66%).
const svg = ({ stroke, scale = 1, bg }) => {
  const size = 100 / scale;
  const o = (size - 100) / 2;
  const rect = bg ? `<rect x="${-o}" y="${-o}" width="${size}" height="${size}" fill="${bg}"/>` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o} ${-o} ${size} ${size}">${rect}` +
      `<path d="${Z}" fill="none" stroke="${stroke}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
};

const write = async (name, buf) => {
  await sharp(buf, { density: 1200 }).resize(1024, 1024).png().toFile(OUT + name);
  console.log('wrote', name);
};

await write('icon.png', svg({ stroke: LIME, scale: 0.75, bg: FOREST }));
await write('android-icon-foreground.png', svg({ stroke: LIME, scale: 0.7 }));
await write('android-icon-background.png', svg({ stroke: FOREST, bg: FOREST }));
await write('android-icon-monochrome.png', svg({ stroke: '#FFFFFF', scale: 0.7 }));
await write('splash-icon.png', svg({ stroke: LIME }));
