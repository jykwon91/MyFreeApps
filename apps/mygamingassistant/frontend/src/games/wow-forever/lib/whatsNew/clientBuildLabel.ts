/**
 * A client build as players read it: "1.60.1.70790" → "patch 1.60.1 (build 70790)".
 * Anything not shaped like major.minor.patch.build is shown as "build <value>".
 */
export function clientBuildLabel(clientBuild: string): string {
  const parts = clientBuild.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) return `build ${clientBuild}`;
  return `patch ${parts.slice(0, 3).join(".")} (build ${parts[3]})`;
}
