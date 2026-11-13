/**
 * `work`'s value, or null when it fails or takes longer than `ms`. Never
 * rejects, so a teardown step can't hang on a page or browser that crashed or
 * stopped answering.
 */
export async function valueWithin<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.catch(() => null), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
