export function formatPickupTime(time: string | undefined): string {
  if (!time) return "?";
  return time.length >= 5 ? time.slice(0, 5) : time;
}
