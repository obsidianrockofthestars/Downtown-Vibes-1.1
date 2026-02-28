const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPinPNG(width, height, r, g, b) {
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  const cx = width / 2;
  const cy = height * 0.4;
  const radius = width * 0.38;
  const tipY = height - 1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    rawData[rowStart] = 0; // PNG filter: None

    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      let alpha = 0;

      if (dist <= radius) {
        // Main circle
        const edge = Math.max(0, Math.min(1, radius - dist));
        alpha = Math.min(255, edge * 255);
      } else if (y > cy + radius * 0.5 && y <= tipY) {
        // Triangle pointer
        const progress = (y - (cy + radius * 0.5)) / (tipY - (cy + radius * 0.5));
        const halfW = radius * (1 - progress * 0.92);
        const dx = Math.abs(x - cx);
        if (dx < halfW) {
          const edge = Math.max(0, Math.min(1, halfW - dx));
          alpha = Math.min(255, edge * 255);
        }
      }

      if (alpha > 0) {
        // White border effect for circle
        const borderWidth = 2;
        const innerDist = dist - (radius - borderWidth);
        if (dist <= radius && innerDist > 0) {
          rawData[px] = 255;
          rawData[px + 1] = 255;
          rawData[px + 2] = 255;
        } else {
          rawData[px] = r;
          rawData[px + 1] = g;
          rawData[px + 2] = b;
        }
        rawData[px + 3] = Math.round(alpha);
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const pins = {
  'pin-restaurant': [34, 197, 94],
  'pin-bar': [59, 130, 246],
  'pin-store': [239, 68, 68],
  'pin-default': [107, 114, 128],
};

const outDir = path.join(__dirname, '..', 'assets', 'pins');
fs.mkdirSync(outDir, { recursive: true });

for (const [name, [r, g, b]] of Object.entries(pins)) {
  const png = createPinPNG(48, 64, r, g, b);
  fs.writeFileSync(path.join(outDir, `${name}.png`), png);
  console.log(`Created ${name}.png (${png.length} bytes)`);
}

console.log('All pin assets generated in assets/pins/');
