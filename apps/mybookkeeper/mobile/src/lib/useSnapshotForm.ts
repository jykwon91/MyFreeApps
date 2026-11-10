import type { WelcomeManualFormProblems } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-form-problems";
import { dirtyFlags, hasDirtyFlags } from "@mybookkeeper/api-client/utils/welcomeManualDirty";
import { hasProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { useState } from "react";

/**
 * A form's typed values, compared against the snapshot taken the moment it opened. Later reloads of
 * the same record can't move that snapshot, so they neither overwrite what's typed nor hide a change.
 */
export function useSnapshotForm<Values extends object>(
  initial: () => Values,
  check: (values: Values) => WelcomeManualFormProblems<Values>,
) {
  const [saved] = useState(initial);
  const [values, setValues] = useState<Values>(saved);
  const [hasTried, setHasTried] = useState(false);
  const dirty = dirtyFlags(saved, values);
  const problems = check(values);

  function edit<Field extends keyof Values>(field: Field, value: Values[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** True when it can be sent; otherwise the problems start showing. */
  function validate(): boolean {
    setHasTried(true);
    return !hasProblems(problems);
  }

  return {
    saved,
    values,
    edit,
    dirty,
    isDirty: hasDirtyFlags(dirty),
    errorFor: (field: keyof Values) => (hasTried ? problems[field] : undefined),
    validate,
  };
}
