// A mesh gradient in an artwork's colours, for the now playing card's background.

/** By artwork URL, so each cover is downloaded and read once; a failure is cached too. */
const meshes = new Map<string, Promise<string>>();

/** CSS background for `url` (a small rendition is plenty). Rejects if the image can't be read. */
export function artMesh(url: string): Promise<string> {
  let mesh = meshes.get(url);
  if (!mesh) meshes.set(url, (mesh = loadImage(url).then(meshFrom)));
  return mesh;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Lets the pixels be read back. Apple's artwork CDN allows it; a host that doesn't fails to load.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

/** Shrinks the art to 3×3 pixels: its corners glow from the card's corners over its centre colour. */
function meshFrom(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 3;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, 3, 3);
  const px = ctx.getImageData(0, 0, 3, 3).data;
  const color = (i: number) => tone(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  return [
    `radial-gradient(at 30% 30%, ${color(0)}, transparent 50%)`,
    `radial-gradient(at 70% 30%, ${color(2)}, transparent 50%)`,
    `radial-gradient(at 30% 70%, ${color(6)}, transparent 50%)`,
    `radial-gradient(at 70% 70%, ${color(8)}, transparent 50%)`,
    color(4),
  ].join(', ');
}

/** More saturated than the art, and never bright enough to wash out the white text on top. */
function tone(r: number, g: number, b: number): string {
  const grey = (r + g + b) / 3;
  const rgb = [r, g, b].map((v) => Math.min(255, Math.max(0, grey + (v - grey) * 1.4)));
  const luma = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const k = Math.min(1, 0.34 / luma);
  return `rgb(${rgb.map((v) => Math.round(v * k)).join(' ')})`;
}
