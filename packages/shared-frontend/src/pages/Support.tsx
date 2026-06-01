import { Link } from "react-router-dom";
import YouTubeEmbed from "../components/embed/YouTubeEmbed";
import KofiButton from "../components/widgets/KofiButton";
import TransparencyWidget from "../components/widgets/TransparencyWidget";

/** Shared Ko-fi page for all MyFreeApps. PLACEHOLDER — operator updates to the real handle. */
const DEFAULT_KOFI_URL = "https://ko-fi.com/myfreeapps";

interface Props {
  /** Host app name, used in the "← Back to {appName}" link, e.g. "MyBookkeeper". */
  appName: string;
  /** Where the back link points. Defaults to the app root. */
  homePath?: string;
  /** Override the shared Ko-fi page URL. */
  kofiUrl?: string;
  /** Unlisted YouTube video ID for the inspiration video. Omit to show a "coming soon" placeholder. */
  youtubeVideoId?: string;
}

/**
 * Public "Support" page shared across every MyFreeApps app: the maker's story,
 * an inspiration video, a live cost-transparency widget, and a single Ko-fi
 * donate CTA. Renders as a standalone page (no auth, no app shell) so logged-out
 * visitors can reach it. Content is platform-wide and identical across apps;
 * only the back-link target differs per app.
 */
export default function Support({
  appName,
  homePath = "/",
  kofiUrl = DEFAULT_KOFI_URL,
  youtubeVideoId,
}: Props) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to={homePath} className="text-sm text-muted-foreground hover:underline">
            ← Back to {appName}
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Why MyFreeApps is free</h1>
        <p className="text-sm text-muted-foreground mb-10">
          A solo-developer project, supported by the people who use it.
        </p>

        <div className="space-y-10">
          <section className="space-y-3 text-sm leading-relaxed">
            <h2 className="sr-only">About MyFreeApps</h2>
            <p>
              I build these apps for my own use and decided not to charge for them — they're more
              useful to me, and to everyone, the more people use them. {appName} and the other
              MyFreeApps tools are free: no ads, no trackers, and nothing sold.
            </p>
            <p>
              I pay for the servers that run them out of my own pocket. If one of these apps has saved
              you time or money, a small donation helps cover hosting and keeps them running and
              maintained — every dollar goes straight to costs.
            </p>
          </section>

          <section>
            <h2 className="sr-only">The story behind these apps</h2>
            <YouTubeEmbed videoId={youtubeVideoId} title="Why I built MyFreeApps" />
          </section>

          <section>
            <TransparencyWidget />
          </section>

          <section className="flex flex-col items-center gap-3 text-center">
            <h2 className="sr-only">Support these apps</h2>
            <KofiButton url={kofiUrl} />
            <p className="text-xs text-muted-foreground">
              Donations are handled securely by Ko-fi — you don't need an account.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
