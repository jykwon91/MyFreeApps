import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import YouTubeEmbed from "../components/embed/YouTubeEmbed";
import KofiButton from "../components/widgets/KofiButton";
import TransparencyWidget from "../components/widgets/TransparencyWidget";

interface Props {
  /** Host app name, used in the "← Back to {appName}" link, e.g. "MyBookkeeper". */
  appName: string;
  /** Where the back link points. Defaults to the app root. */
  homePath?: string;
  /**
   * The app's Ko-fi donate URL. When omitted, the donate button renders disabled
   * ("Donations coming soon") — set this once a real Ko-fi account exists.
   */
  kofiUrl?: string;
  /** Unlisted YouTube video ID for the inspiration video. Omit to show a "coming soon" placeholder. */
  youtubeVideoId?: string;
  /**
   * Render the live cost-transparency widget. Default true. Set false for an app
   * that can't read the shared transparency object — e.g. MyGamingAssistant serves
   * from Cloudflare R2, not the shared MinIO, so it never sees the shared object.
   * The donation CTA, story, and video still render.
   */
  showTransparency?: boolean;
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
  kofiUrl,
  youtubeVideoId,
  showTransparency = true,
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
              {appName} and the other MyFreeApps tools are free — no ads, no trackers,
              nothing sold. Donations help cover the server and API costs that keep them
              running.
            </p>
          </section>

          <section>
            <h2 className="sr-only">The story behind these apps</h2>
            <YouTubeEmbed videoId={youtubeVideoId} title="Why I built MyFreeApps" />
          </section>

          {showTransparency && (
            <section>
              <TransparencyWidget />
            </section>
          )}

          <section className="flex flex-col items-center gap-3 text-center">
            <h2 className="sr-only">Support these apps</h2>
            {kofiUrl ? (
              <>
                <KofiButton url={kofiUrl} />
                <p className="text-xs text-muted-foreground">
                  Donations are handled securely by Ko-fi — you don't need an account.
                </p>
              </>
            ) : (
              <>
                <Button variant="primary" disabled>
                  Support on Ko-fi
                </Button>
                <p className="text-xs text-muted-foreground">Donations coming soon.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
