/**
 * CalibrateWebPlaceholder — shown on the web build.
 *
 * Mirrors the shape of `LiveCs2WebPlaceholder` so the user gets a consistent
 * "this is a desktop-only feature" experience regardless of which surface
 * they land on first.
 */
import { Link } from "react-router-dom";
import { ArrowLeft, Crosshair, Settings as SettingsIcon } from "lucide-react";

export default function CalibrateWebPlaceholder() {
  return (
    <main className="p-8 max-w-2xl space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Crosshair className="w-5 h-5" />
        Live mode calibration is a desktop feature
      </h1>
      <p className="text-sm text-muted-foreground">
        The minimap calibration editor reads your screen directly to let you
        mark the minimap region, draw zone polygons, and tune the player-dot
        detection. It only works inside the MyGamingAssistant desktop
        application.
      </p>
      <Link
        to="/live/cs2/setup"
        className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-md border bg-card hover:bg-muted/40 text-sm"
      >
        <SettingsIcon className="w-4 h-4" />
        View live mode setup
      </Link>
    </main>
  );
}
