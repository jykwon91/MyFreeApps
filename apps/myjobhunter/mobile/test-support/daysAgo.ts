import { MS_PER_DAY } from "@myjobhunter/api-client/constants/stageAge";

/** When something happened this many days ago, plus an hour so whole days round down to it. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY - 60 * 60 * 1000).toISOString();
}
