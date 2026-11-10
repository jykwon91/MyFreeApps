/** Which keys of a form differ from the snapshot it was opened with. */
export type WelcomeManualDirtyFlags<T> = Partial<Record<keyof T, boolean>>;
