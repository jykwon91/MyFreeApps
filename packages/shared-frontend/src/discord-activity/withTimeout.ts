/**
 * `work`'s outcome, or a rejection once `ms` have passed without one. The work
 * itself isn't cancelled — it just stops holding up the caller, so a request
 * that never answers can't keep "Connecting to Discord…" up forever.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} took longer than ${ms} ms.`));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
