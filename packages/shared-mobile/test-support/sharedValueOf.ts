import type { SharedValue } from "react-native-reanimated";

/** A shared value for tests, as Reanimated's Jest mock reads one: a plain holder of `value`. */
export function sharedValueOf<Value>(initial: Value): SharedValue<Value> {
  let current = initial;
  return {
    get value() {
      return current;
    },
    set value(next: Value) {
      current = next;
    },
    get: () => current,
    set: (next) => {
      current = next instanceof Function ? next(current) : next;
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    modify: (modifier) => {
      if (modifier) current = modifier(current);
    },
  };
}
