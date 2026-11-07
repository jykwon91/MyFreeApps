type Step = () => Promise<unknown>;

async function failuresOf(steps: Step[]): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      failures.push(err);
    }
  }
  return failures;
}

/** Runs every step, in order, even after one fails; then throws what failed. */
export async function cleanUp(...steps: Step[]): Promise<void> {
  const failures = await failuresOf(steps);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "several cleanup steps failed");
}

/** For a setup that failed with ``err``: runs every step, then rethrows ``err`` with any cleanup failures. */
export async function cleanUpAfter(err: unknown, ...steps: Step[]): Promise<never> {
  const failures = await failuresOf(steps);
  if (failures.length > 0) throw new AggregateError([err, ...failures], "setup failed, and so did cleaning up after it");
  throw err;
}
