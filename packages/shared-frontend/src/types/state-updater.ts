/** A new value, or a function of the previous one (React / TanStack updater shape). */
export type StateUpdater<T> = T | ((prev: T) => T);
