/** A press handler. Return a promise (or any thenable, such as a refetch) to have the control show busy until it settles. */
export type PressHandler = () => void | PromiseLike<unknown>;
