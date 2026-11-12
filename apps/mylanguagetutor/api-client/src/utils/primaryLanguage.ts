/** A BCP-47 locale's language alone, lower-cased: "es-MX" and "es_MX" are both "es". */
export function primaryLanguage(locale: string): string {
  return locale.replace("_", "-").toLowerCase().split("-")[0];
}
