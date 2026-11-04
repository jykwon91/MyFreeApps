const TOO_MANY = "You've opened a lot of private details in the last hour. Try again later.";
const FAILED = "I couldn't load those details. Want me to try again?";

export function applicantRevealFailure(error: unknown): string {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 429 ? TOO_MANY : FAILED;
}
