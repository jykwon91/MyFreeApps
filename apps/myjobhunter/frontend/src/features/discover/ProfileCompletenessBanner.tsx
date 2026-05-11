/**
 * ProfileCompletenessBanner — shown at the top of the Discover inbox when the
 * operator has no resume and no skills on their profile.
 *
 * Without a resume or skills the embedding + scoring service cannot produce
 * meaningful match scores, so every discovered posting would show "Awaiting AI
 * score" indefinitely. This banner surfaces that dependency early so the
 * operator knows what to do, rather than wondering why the scores never fill in.
 *
 * Dismissal: clicking the X sets a localStorage flag so the banner stays hidden
 * across sessions. The operator can still browse without scores — the banner is
 * a soft nudge, not a hard gate.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const STORAGE_KEY = "mjh_discover_profile_banner_dismissed";

function readStoredDismissal(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeDismissal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable — best-effort; banner will reappear on reload
  }
}

interface ProfileCompletenessBannerProps {
  onDismiss: () => void;
}

/**
 * Pure presentational banner — no localStorage awareness.
 * Exported for unit testing without storage side-effects.
 */
export function ProfileCompletenessBannerContent({
  onDismiss,
}: ProfileCompletenessBannerProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm dark:border-yellow-800 dark:bg-yellow-950"
      role="alert"
      data-testid="profile-completeness-banner"
    >
      <div className="flex-1">
        <p className="font-medium text-yellow-800 dark:text-yellow-200">
          Add your resume to see match scores
        </p>
        <p className="mt-0.5 text-yellow-700 dark:text-yellow-300">
          Without a resume or skills, MyJobHunter can&#39;t rank discovered
          postings. Add either to start seeing match scores.
        </p>
        <Link
          to="/profile"
          className="mt-2 inline-block font-medium text-yellow-800 underline hover:no-underline dark:text-yellow-200"
        >
          Set up profile
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200"
        aria-label="Dismiss this banner"
        data-testid="profile-completeness-banner-dismiss"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

interface ProfileCompletenessBannerContainerProps {
  /** True when the profile has a parsed resume (resume_file_path is non-null). */
  hasResume: boolean;
  /** True when the profile has at least one skill. */
  hasSkills: boolean;
}

/**
 * Smart container: owns localStorage state and renders nothing when the profile
 * is already complete or the operator has dismissed the banner.
 */
export default function ProfileCompletenessBanner({
  hasResume,
  hasSkills,
}: ProfileCompletenessBannerContainerProps) {
  const [dismissed, setDismissed] = useState(readStoredDismissal);

  const profileIncomplete = !hasResume && !hasSkills;

  if (!profileIncomplete || dismissed) {
    return null;
  }

  function handleDismiss() {
    storeDismissal();
    setDismissed(true);
  }

  return <ProfileCompletenessBannerContent onDismiss={handleDismiss} />;
}
