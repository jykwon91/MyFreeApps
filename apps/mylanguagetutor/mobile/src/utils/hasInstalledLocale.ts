/** Whether `locale` ("es-MX") is among the recognizer's installed languages, however the phone writes them ("es_MX", "es-mx"). */
export function hasInstalledLocale(installed: readonly string[], locale: string): boolean {
  const normal = (value: string) => value.replace("_", "-").toLowerCase();
  return installed.some((value) => normal(value) === normal(locale));
}
