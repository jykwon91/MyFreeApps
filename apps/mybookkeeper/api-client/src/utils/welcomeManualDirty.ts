import type { WelcomeManualDirtyFlags } from "../types/welcome-manual/welcome-manual-dirty-flags";

/** Flags every key whose value differs from the snapshot the form was opened with. */
export function dirtyFlags<T extends object>(snapshot: T, current: T): WelcomeManualDirtyFlags<T> {
  const flags: WelcomeManualDirtyFlags<T> = {};
  for (const key of Object.keys(snapshot) as (keyof T)[]) {
    if (snapshot[key] !== current[key]) flags[key] = true;
  }
  return flags;
}

export function hasDirtyFlags<T extends object>(flags: WelcomeManualDirtyFlags<T>): boolean {
  return Object.values(flags).some(Boolean);
}
