import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

/**
 * A react-hook-form resolver from a shared check that returns a message per field, so the website
 * validates with the same rules as the phone, on the trimmed values that are sent.
 */
export function problemsResolver<Values extends FieldValues>(
  problemsOf: (values: Values) => Partial<Record<keyof Values, string>>,
): Resolver<Values> {
  return (values) => {
    const problems = problemsOf(values);
    const errors: FieldErrors<Values> = {};
    for (const field of Object.keys(problems) as (keyof Values & string)[]) {
      const message = problems[field];
      if (message) Object.assign(errors, { [field]: { type: "validate", message } });
    }
    return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} };
  };
}
