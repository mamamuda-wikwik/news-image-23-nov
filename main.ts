// main.ts — entry-point grader for news-image-20261123.
// Validates entry.png (1024x1024, <= 1 MiB, well-formed PNG chunks) and
// copies it to the output directory.
// Usage: node main.ts [outDir]   (outDir > MAKEFUN_OUTPUT_DIR > /output)
// Exit 0 on success, 1 on any validation failure. Node stdlib only.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 1024 * 1024;

function fail(msg: string): never {
  console.error("FAIL:", msg);
  process.exit(1);
}

function chunkType(buf: Buffer, off: number): string {
  return buf.toString("ascii", off + 4, off + 8);
}

function main(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = path.join(here, "entry.png");
  if (!fs.existsSync(src)) fail("entry.png not found next to main.ts");
  const data = fs.readFileSync(src);
  if (data.length > MAX_BYTES) {
    fail(`entry.png is ${data.length} bytes, over the 1 MiB limit`);
  }
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_MAGIC)) {
    fail("entry.png does not start with the PNG magic bytes");
  }
  // The first chunk must be IHDR, per the PNG spec.
  if (chunkType(data, 8) !== "IHDR") {
    fail("first chunk is not IHDR");
  }
  // Walk the chunk list: length(4) + type(4) + data(length) + crc(4).
  let off = 8;
  let sawIHDR = false;
  let sawIEND = false;
  let sawIDAT = false;
  while (off + 8 <= data.length) {
    const len = data.readUInt32BE(off);
    const type = chunkType(data, off);
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    // Bounds: chunk data + CRC must stay inside the file.
    if (dataEnd + 4 > data.length) {
      fail(`chunk ${type} at offset ${off} overruns the file`);
    }
    if (type === "IHDR") {
      sawIHDR = true;
      if (len !== 13) fail("IHDR chunk must be 13 bytes");
      const w = data.readUInt32BE(dataStart);
      const h = data.readUInt32BE(dataStart + 4);
      if (w !== 1024 || h !== 1024) {
        fail(`entry.png is ${w}x${h}, expected 1024x1024`);
      }
      // entry.png is an RGB image: bit depth 8, color type 2.
      const bitDepth = data[dataStart + 8];
      const colorType = data[dataStart + 9];
      if (bitDepth !== 8 || colorType !== 2) {
        fail(`unexpected IHDR bit depth ${bitDepth} / color type ${colorType}`);
      }
    }
    if (type === "IDAT") sawIDAT = true;
    if (type === "IEND") {
      sawIEND = true;
      if (len !== 0) fail("IEND chunk must be empty");
      break;
    }
    off = dataEnd + 4;
  }
  if (!sawIHDR) fail("no IHDR chunk found");
  if (!sawIDAT) fail("no IDAT chunk found");
  if (!sawIEND) fail("no IEND chunk found");
  // IEND must be the final chunk: nothing but its 12 bytes may follow.
  if (off + 12 !== data.length) {
    fail("trailing bytes after the IEND chunk");
  }

  const outDir = process.argv[2] ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, "entry.png");
  fs.copyFileSync(src, dest);
  const copied = fs.readFileSync(dest);
  if (!copied.equals(data)) fail("copied entry.png differs from the source");
  console.log(`entry.png: 1024x1024, ${data.length} bytes -> ${dest}`);
}

main();
