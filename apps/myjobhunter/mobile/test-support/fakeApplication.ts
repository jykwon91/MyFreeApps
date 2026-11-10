/** Stands in for expo-application: the app was installed once, at a fixed time. */
export const INSTALLED_AT = new Date("2026-01-01T00:00:00.000Z");

export async function getInstallationTimeAsync(): Promise<Date> {
  return INSTALLED_AT;
}
