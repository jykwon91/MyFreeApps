export function photoName(now: Date = new Date()): string {
  return `receipt-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
}

/** The queue reads a file's type from its name, and a picked file's name can lack the extension. */
export function pdfFileName(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}
