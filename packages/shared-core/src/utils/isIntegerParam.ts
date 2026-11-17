const INTEGER_PATTERN = /^[1-9]\d{0,9}$/;

/** Whether a route param is a positive whole number, the shape of an integer record id. */
export function isIntegerParam(value: unknown): value is string {
  return typeof value === "string" && INTEGER_PATTERN.test(value);
}
