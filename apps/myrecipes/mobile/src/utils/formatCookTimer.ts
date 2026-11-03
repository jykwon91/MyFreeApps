import type { CookTimer } from "../types/CookTimer";

/** A wait as a label: "10 min", "1 hr 30 min", "45 sec". */
export function formatTimerDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours && `${hours} hr`, minutes && `${minutes} min`, seconds && `${seconds} sec`]
    .filter(Boolean)
    .join(" ");
}

/** Time left as a clock: "9:41", "1:02:05". */
export function formatTimeLeft(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Whole seconds left, never more than the timer's length even if `now` is a moment old. */
export function secondsLeft({ endsAt, seconds }: Pick<CookTimer, "endsAt" | "seconds">, now: number): number {
  return Math.min(seconds, Math.max(0, Math.ceil((endsAt - now) / 1000)));
}

/** Time left in words, steady enough for a screen reader: "about 10 minutes". */
export function spokenTimeLeft(totalSeconds: number): string {
  if (totalSeconds < 60) return "less than a minute";
  const minutes = Math.ceil(totalSeconds / 60);
  return minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`;
}
