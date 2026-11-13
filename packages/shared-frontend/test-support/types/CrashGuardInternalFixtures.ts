import type { CrashLedger } from "./CrashLedger";

/** Fixtures the crash guard uses internally; specs use pageCrashes and guardContext instead. */
export interface CrashGuardInternalFixtures {
  crashLedger: CrashLedger;
}
