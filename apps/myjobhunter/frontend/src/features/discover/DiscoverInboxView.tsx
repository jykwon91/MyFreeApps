import { useEffect, useRef, useState } from "react";
import { Telescope } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import ProfileCompletenessBanner from "@/features/discover/ProfileCompletenessBanner";
import { useListDiscoveredJobsQuery, useListDiscoverySourcesQuery } from "@/store/discoverApi";
import { useGetProfileQuery } from "@/lib/profileApi";
import { useListSkillsQuery } from "@/lib/skillsApi";

// Background scoring runs after /refresh as a FastAPI BackgroundTask
// (~30s for the prefilter top-N). While a fetch is plausibly still
// scoring we poll so the new verdicts fill in without a manual reload —
// but ONLY for a bounded window (see SCORING_WINDOW_MS). The scorer rates
// only the daily prefilter top-N, so most fetched rows stay unscored
// permanently; an unbounded poll would spin forever against a tail that
// never resolves. Once the window closes, polling goes idle and unscored
// cards settle into a static "Not scored" pill.
const INBOX_POLL_INTERVAL_MS = 4000;

// How long after a fresh fetch lands we keep polling + show the animated
// "Scoring" affordance. Comfortably covers the background scorer's ~30s
// pass for the top-N with headroom, then terminates to a real state.
const SCORING_WINDOW_MS = 60_000;

interface DiscoverInboxViewProps {
  hasSources: boolean;
  /** Active source filter from ?source= URL param. Null = no filter (show all). */
  activeSourceId: string | null;
}

export default function DiscoverInboxView({
  hasSources,
  activeSourceId,
}: DiscoverInboxViewProps) {
  // Include source_id in query args so RTK Query uses it as part of the cache key.
  // When source_id changes the cache key changes → fresh fetch, no stale data.
  const queryArgs = activeSourceId
    ? { state: "inbox" as const, source_id: activeSourceId }
    : { state: "inbox" as const };

  // Bounded scoring window. We poll (and show the animated spinner) only
  // while this is true; it auto-closes after SCORING_WINDOW_MS. Opened
  // when a fresh fetch lands — detected below by a jump in the unscored
  // count, which is what /refresh produces.
  const [isScoringWindowOpen, setIsScoringWindowOpen] = useState(false);
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUnscoredRef = useRef<number | null>(null);

  const { data: jobsData, isLoading, isError } = useListDiscoveredJobsQuery(
    queryArgs,
    // Poll only while the bounded scoring window is open. `0` disables
    // polling in RTK Query, so the steady state makes no network noise.
    // The window auto-closes via timer (SCORING_WINDOW_MS) or earlier once
    // every row is scored (see isScoringActive below), so this never polls
    // indefinitely.
    { pollingInterval: isScoringWindowOpen ? INBOX_POLL_INTERVAL_MS : 0 },
  );

  const totalCount = jobsData?.total_count ?? null;
  const scoredCount = jobsData?.scored_count ?? null;
  const unscoredCount =
    totalCount !== null && scoredCount !== null ? totalCount - scoredCount : null;

  // Open the bounded scoring window when a fresh fetch lands. A /refresh
  // adds new (unscored) rows, so a jump in the unscored count is our
  // signal. We compare against the previous observed count rather than
  // "any unscored exist", so a steady tail of permanently-unscored rows
  // does NOT keep re-opening the window (which would resurrect the
  // forever-poll this fix removes). This effect only ever OPENS the
  // window (and arms the close-timer); it never closes synchronously, so
  // it can't trigger cascading renders.
  useEffect(() => {
    if (unscoredCount === null) {
      return;
    }
    const prev = prevUnscoredRef.current;
    prevUnscoredRef.current = unscoredCount;

    // First observation just seeds the baseline — never opens the window.
    if (prev === null) {
      return;
    }
    if (unscoredCount > prev) {
      setIsScoringWindowOpen(true);
      if (windowTimerRef.current !== null) {
        clearTimeout(windowTimerRef.current);
      }
      windowTimerRef.current = setTimeout(() => {
        setIsScoringWindowOpen(false);
        windowTimerRef.current = null;
      }, SCORING_WINDOW_MS);
    }
  }, [unscoredCount]);

  // Clean up the timer on unmount so it can't fire after the view is gone.
  useEffect(() => {
    return () => {
      if (windowTimerRef.current !== null) {
        clearTimeout(windowTimerRef.current);
      }
    };
  }, []);

  // Effective "scoring in flight" signal: the window is open AND there is
  // still something unscored to wait for. Deriving the "all scored → done"
  // close at render time (rather than in a setState-in-effect) avoids
  // cascading renders — once every row is scored the spinner stops and
  // polling idles immediately, even before the timer elapses. The timer
  // remains the upper bound for the never-resolves case.
  const isScoringActive = isScoringWindowOpen && unscoredCount !== 0;

  const { data: sources } = useListDiscoverySourcesQuery();
  const { data: profile } = useGetProfileQuery();
  const { data: skillsData } = useListSkillsQuery();

  const hasResume = profile?.resume_file_path != null;
  const hasSkills = (skillsData?.total ?? 0) > 0;

  if (!hasSources) {
    return (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={DISCOVER_EMPTY_STATES.no_saved_searches.heading}
        body={DISCOVER_EMPTY_STATES.no_saved_searches.body}
      />
    );
  }

  const profileBanner = (
    <ProfileCompletenessBanner hasResume={hasResume} hasSkills={hasSkills} />
  );

  if (isError) {
    return (
      <>
        {profileBanner}
        <p className="text-sm text-destructive">
          Couldn't load the inbox — try refreshing the page.
        </p>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {profileBanner}
        <DiscoveredJobsSkeleton />
      </>
    );
  }

  const items = jobsData?.items ?? [];

  if (items.length === 0) {
    return (
      <>
        {profileBanner}
        <EmptyState
          icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
          heading={DISCOVER_EMPTY_STATES.inbox_empty.heading}
          body={DISCOVER_EMPTY_STATES.inbox_empty.body}
        />
      </>
    );
  }

  // Coverage line: the scorer only rates the daily prefilter top-N, so a
  // large unscored tail is expected, not a failure. Surfacing "Scored N of
  // M" makes that legible — without it, rows stuck on a "Not scored" pill
  // read as broken.
  const showCoverage =
    scoredCount !== null && totalCount !== null && totalCount > 0;
  const coverageLine = showCoverage
    ? `Scored ${scoredCount} of ${totalCount}` +
      (unscoredCount !== null && unscoredCount > 0
        ? " — the rest await the next daily scoring pass"
        : "")
    : null;

  // Pass profile.updated_at to each card so the card can detect
  // when its score was computed against an older profile snapshot
  // (profile changed after scored_at → "Re-scoring soon" pill).
  const profileUpdatedAt = profile?.updated_at ?? null;

  return (
    <div className="space-y-3">
      {profileBanner}
      {coverageLine && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="inbox-scoring-coverage"
        >
          {coverageLine}
        </p>
      )}
      {items.map((job) => (
        <DiscoveredJobCard
          key={job.id}
          job={job}
          isScoringInFlight={isScoringActive}
          profileUpdatedAt={profileUpdatedAt}
          sources={sources ?? []}
        />
      ))}
    </div>
  );
}
