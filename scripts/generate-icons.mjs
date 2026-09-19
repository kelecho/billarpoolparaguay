import sharp from 'sharp';

for (const size of [192, 512]) {
  await sharp(new URL('../public/icon.svg', import.meta.url).pathname)
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/icon-${size}.png`, import.meta.url).pathname);
}
