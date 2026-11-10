/** Lowercase, accents and quotes gone, so "Résumé", "Tenant’s" and "tenants" compare alike. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’‚‛′']/g, "")
    .replace(/[“”„‟"]/g, " ")
    .toLowerCase();
}

/** The runs of letters and digits, so "Property P&L" is ["property", "p", "l"]. */
export function searchWords(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words run together, so "w2" and "w-2", or "p & l" and "P&L", compare alike. */
export function searchJoined(text: string): string {
  return searchWords(text).join("");
}
