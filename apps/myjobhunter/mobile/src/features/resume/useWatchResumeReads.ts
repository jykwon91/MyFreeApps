import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import { resumesApi, useListResumeJobsQuery } from "@myjobhunter/api-client/store/resumesApi";
import { resumeJobsInFlight } from "@myjobhunter/api-client/utils/resumeJobsInFlight";

/**
 * Keeps watching the uploads while any is still being read, wherever the person is in the app, so a
 * finished read refreshes the profile lists (see `resumesApi`) even after they've left Resume.
 * Held by the signed-in layout: a screen-level subscription is dropped when its screen goes, and the
 * cached list with it, which is what lets a finish be told from a first load.
 */
export function useWatchResumeReads(): void {
  const cached = resumesApi.endpoints.listResumeJobs.useQueryState().data;
  const isReading = resumeJobsInFlight(cached ?? []).length > 0;
  useListResumeJobsQuery(undefined, { pollingInterval: isReading ? RESUME_JOBS_POLL_INTERVAL_MS : 0, skipPollingIfUnfocused: true });
}
