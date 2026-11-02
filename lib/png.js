'use strict';

const fs = require('fs/promises');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Reads width/height from the IHDR chunk of a PNG file without decoding it.
async function pngSize(filepath) {
  const handle = await fs.open(filepath, 'r');
  try {
    const buf = Buffer.alloc(24);
    await handle.read(buf, 0, 24, 0);
    if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`Not a PNG file: ${filepath}`);
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

module.exports = { pngSize };
