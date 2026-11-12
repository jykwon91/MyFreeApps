import { REFINEMENT_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/refinementPolling";
import { resumeRefinementApi, useGetRefinementSessionQuery } from "@myjobhunter/api-client/store/resumeRefinementApi";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { EmptyState, LoadingButton, useScreenFocused } from "@platform/mobile";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeSessionLoaderProps } from "../../types/ResumeSessionLoaderProps";
import ResumeIntro from "./ResumeIntro";
import ResumeScroll from "./ResumeScroll";
import ResumeSessionSkeleton from "./ResumeSessionSkeleton";
import ResumeSessionView from "./ResumeSessionView";

/**
 * Loads the session and polls it while it's on screen: the poll drives the preparation's progress
 * and the unlock, and picks up what another device did. Polling stops once the session is done,
 * which nothing changes after, and once the server says it's gone.
 */
export default function ResumeSessionLoader({ sessionId, onStartNew }: ResumeSessionLoaderProps) {
  const isFocused = useScreenFocused();
  // What the last answer said, read without subscribing, decides whether the next poll is worth it.
  const cached = resumeRefinementApi.endpoints.getRefinementSession.useQueryState(sessionId);
  const isSettled = cached.data?.status === "completed" || isNotFound(cached.error);
  const query = useGetRefinementSessionQuery(sessionId, {
    pollingInterval: isFocused && !isSettled ? REFINEMENT_POLL_INTERVAL_MS : 0,
    skipPollingIfUnfocused: true,
  });
  // A 404 means the session was removed (on another device, say), even after it loaded: what's
  // on screen can't be acted on, so it isn't kept under the offline banner.
  const isGone = isNotFound(query.error);

  if (query.data && !isGone) {
    return <ResumeSessionView isStale={query.isError} onStartNew={onStartNew} renewSession={() => query.refetch().unwrap()} session={query.data} />;
  }
  if (query.isError) {
    return (
      <ResumeScroll testID="resume">
        <ResumeIntro />
        {isGone ? (
          <EmptyState action={{ label: MESSAGES.startNew, onPress: onStartNew }} body={MESSAGES.sessionGoneBody} heading={MESSAGES.sessionGoneHeading} />
        ) : (
          <>
            <EmptyState
              action={{ label: MESSAGES.tryAgain, onPress: () => void query.refetch(), isLoading: query.isFetching }}
              body={MESSAGES.couldntLoadSessionBody}
              heading={MESSAGES.couldntLoadSession}
            />
            <LoadingButton onPress={onStartNew} variant="ghost">
              {MESSAGES.startNew}
            </LoadingButton>
          </>
        )}
      </ResumeScroll>
    );
  }
  return (
    <ResumeScroll testID="resume">
      <ResumeSessionSkeleton />
    </ResumeScroll>
  );
}
