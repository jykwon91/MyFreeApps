/**
 * Call every function with `args`, even when one throws, then rethrow the first
 * error, so one failing listener can't leave the others uncalled.
 */
export function callEach<A extends unknown[]>(fns: Iterable<(...args: A) => void>, ...args: A): void {
  const errors: unknown[] = [];
  for (const fn of fns) {
    try {
      fn(...args);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}
