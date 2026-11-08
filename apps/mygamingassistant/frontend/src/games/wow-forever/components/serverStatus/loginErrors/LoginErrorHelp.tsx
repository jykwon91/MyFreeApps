import { useState } from "react";
import { useLocation } from "react-router-dom";
import LoginErrorCard from "@/games/wow-forever/components/serverStatus/loginErrors/LoginErrorCard";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { LOGIN_ERRORS } from "@/games/wow-forever/data/serverStatus/loginErrors";
import { useScrollToHash } from "@/games/wow-forever/hooks/useScrollToHash";
import { loginErrorAnchor, searchLoginErrors } from "@/games/wow-forever/lib/serverStatus/searchLoginErrors";

/** Common login and connection errors, searchable by code or words, each with a `#err-…` link. */
export default function LoginErrorHelp() {
  const [query, setQuery] = useState("");
  const { hash } = useLocation();
  const target = decodeURIComponent(hash.slice(1));
  const matches = searchLoginErrors(LOGIN_ERRORS, query);
  useScrollToHash(true);
  return (
    <section aria-labelledby="login-help-heading" className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      <div className="space-y-1">
        <h2 id="login-help-heading" className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Can&apos;t log in?
        </h2>
        <p className="text-sm text-muted-foreground">
          Common login and connection errors, what they mean and what to try. If the realm is down above, waiting is
          usually the fix.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search an error code or message, e.g. 51900319"
        aria-label="Search login errors"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {matches.length === 0 ? (
        <EmptyStateNote message="No error matches that. Try the code without the letters, or a word from the message." />
      ) : (
        <ul aria-label="Login errors" className="space-y-3">
          {matches.map((entry) => (
            <LoginErrorCard key={entry.id} entry={entry} targeted={loginErrorAnchor(entry) === target} />
          ))}
        </ul>
      )}
    </section>
  );
}
