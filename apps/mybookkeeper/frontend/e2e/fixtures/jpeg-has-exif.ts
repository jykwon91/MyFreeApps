/** Whether a JPEG has an APP1 EXIF segment, where cameras write GPS coordinates. */
export function jpegHasExif(bytes: Buffer): boolean {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return false;
    if (marker === 0xe1 && bytes.toString("latin1", offset + 4, offset + 10) === "Exif\0\0") return true;
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return false;
}
