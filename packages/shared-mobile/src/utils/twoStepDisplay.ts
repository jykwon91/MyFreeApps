export function keyInFours(key: string): string {
  return key.replace(/(.{4})(?=.)/g, "$1 ");
}

export function algorithmName(algorithm: string): string {
  return algorithm.toUpperCase().replace(/^SHA(\d)/, "SHA-$1");
}

/** One character at a time, so a screen reader doesn't try to say the key as words. */
export function keyForScreenReader(secret: string): string {
  return secret.split("").join(" ");
}
