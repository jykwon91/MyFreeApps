import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { COMPANION_GAMES, WOW_FOREVER_SLUG } from "@/games/registry";

/** /wow-forever — entry point for the WoW Forever companion pages. */
export default function WowForeverLanding() {
  const features = COMPANION_GAMES[WOW_FOREVER_SLUG].features;
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="World of Warcraft: Forever"
        subtitle="Help for new players and a quick way to check gear upgrades."
        backTo="/"
        backLabel="Back to games"
      />
      <AlertBox variant="info">
        Forever is in beta. Much of this is based on Classic Era and may change as Forever's details are published.
      </AlertBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <Link
            key={f.path}
            to={f.path}
            className="group rounded-xl border bg-card p-5 space-y-2 hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center justify-between gap-2 text-lg font-semibold">
              {f.title}
              <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" aria-hidden />
            </span>
            <span className="block text-sm text-muted-foreground">{f.description}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
