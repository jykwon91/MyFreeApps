/** The id ``FieldProblem`` renders for one field, e.g. ``mortgage-termMonths-problem``. */
export function fieldProblemId(prefix: string, field: string): string {
  return `${prefix}-${field}-problem`;
}

/** Marks a control invalid and ties it to the message element ``id``. Nothing while ``problem`` is empty. */
export function problemAria(problem: unknown, id: string) {
  return problem ? ({ "aria-invalid": true, "aria-describedby": id } as const) : {};
}

/** ``problemAria`` for a form that keeps its problems in one map keyed by field. */
export function fieldProblemAria<K extends string>(
  problems: Partial<Record<K, unknown>>,
  field: K,
  prefix: string,
) {
  return problemAria(problems[field], fieldProblemId(prefix, field));
}
