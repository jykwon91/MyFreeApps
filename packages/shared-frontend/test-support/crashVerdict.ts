/**
 * The crash guard's verdict on a finished test: the failure message to raise,
 * or null when the test may pass. Pure, so the rule is unit-tested without a
 * browser. A test that crashes on purpose opts in with `allowCrashes`.
 */
export function crashVerdict(crashes: readonly string[], allowCrashes: boolean): string | null {
  if (allowCrashes || crashes.length === 0) return null;
  return [
    "The page crashed. Fix the stub or the page, or opt in with test.use({ allowCrashes: true }).",
    ...crashes.map((crash, index) => `${index + 1}. ${crash}`),
  ].join("\n\n");
}
