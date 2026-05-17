import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ICON_SVG = join(ROOT, "src/app/icon.svg");
const SRC_FAVICON_ICO = join(ROOT, "src/app/favicon.ico");
const MASKABLE_SVG = join(ROOT, "public/icons/icon-maskable.svg");
const PUBLIC_ICONS_DIR = join(ROOT, "public/icons");

// density 384 = 4× sharp's default 96 DPI. Produces crisp output when
// upscaling a 64-unit viewBox SVG to 512px (64 × 4 = 256 internal, then resize).
const SVG_DENSITY = 384;

async function svgToPng(svgPath: string, size: number, outPath: string) {
  const svg = await readFile(svgPath);
  await sharp(svg, { density: SVG_DENSITY })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ${outPath} (${size}x${size})`);
}

async function svgToPngBuffer(svgPath: string, size: number): Promise<Buffer> {
  const svg = await readFile(svgPath);
  return sharp(svg, { density: SVG_DENSITY })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(PUBLIC_ICONS_DIR, { recursive: true });

  console.log("[icons] manifest PNGs");
  await svgToPng(SRC_ICON_SVG, 192, join(PUBLIC_ICONS_DIR, "icon-192.png"));
  await svgToPng(SRC_ICON_SVG, 512, join(PUBLIC_ICONS_DIR, "icon-512.png"));

  console.log("[icons] maskable PNG");
  await svgToPng(MASKABLE_SVG, 512, join(PUBLIC_ICONS_DIR, "icon-maskable-512.png"));

  console.log("[icons] favicon.ico (16/32/48)");
  const [b16, b32, b48] = await Promise.all([
    svgToPngBuffer(SRC_ICON_SVG, 16),
    svgToPngBuffer(SRC_ICON_SVG, 32),
    svgToPngBuffer(SRC_ICON_SVG, 48),
  ]);
  const ico = await pngToIco([b16, b32, b48]);
  await writeFile(SRC_FAVICON_ICO, ico);
  console.log(`  ${SRC_FAVICON_ICO}`);

  console.log("[icons] copy icon.svg → public/icons/");
  await copyFile(SRC_ICON_SVG, join(PUBLIC_ICONS_DIR, "icon.svg"));
  console.log(`  ${join(PUBLIC_ICONS_DIR, "icon.svg")}`);

  console.log("[icons] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
