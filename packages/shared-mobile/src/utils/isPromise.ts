// Duck-typed: `instanceof Promise` misses thenables and promises from another
// implementation, and a miss here would silently drop the loading state.
export function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
