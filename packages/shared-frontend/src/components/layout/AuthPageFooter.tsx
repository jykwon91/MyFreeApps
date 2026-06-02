import { Link } from "react-router-dom";

interface Props {
  /** App name shown in the copyright line, e.g. "MyBookkeeper". */
  appName: string;
}

/**
 * Footer shown on the public auth pages (Login / Register) of every
 * MyFreeApps app. Renders a "Support Me" link to the shared ``/support`` page
 * plus a copyright line, so logged-out visitors always have a path to the
 * donation / cost-transparency page even though the in-app "Support Me" nav
 * item is only reachable once the shell is mounted.
 *
 * Extracted from the three byte-identical copies that previously lived inline
 * in MyJobHunter / MyGamingAssistant / MyPizzaTracker Login pages (parity
 * auto-promote — see rules/monorepo-parity-discipline.md). The year is derived
 * at render time so the line never goes stale.
 */
export default function AuthPageFooter({ appName }: Props) {
  const year = new Date().getFullYear();
  return (
    <p className="mt-8 text-xs text-muted-foreground text-center">
      <Link
        to="/support"
        className="hover:underline hover:text-foreground transition-colors"
      >
        Support Me
      </Link>
      <span className="mx-2" aria-hidden="true">
        ·
      </span>
      &copy; {year} {appName}
    </p>
  );
}
