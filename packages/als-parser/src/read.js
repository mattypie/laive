import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";

export function decodeAlsBuffer(buffer) {
  const xmlBuffer = isGzip(buffer) ? gunzipSync(buffer) : buffer;
  return xmlBuffer.toString("utf8");
}

function isGzip(buffer) {
  return buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

export async function readAlsFile(filePath) {
  const buffer = await readFile(filePath);
  return decodeAlsBuffer(buffer);
}
