/**
 * RoundMode — full-viewport view of pinned lineups for the current (game, map, side).
 *
 * Activated by ?round=1 on the /:gameSlug/:mapSlug route.
 * Rendered by MapPage when the URL param is present.
 *
 * Layout:
 *   - No app shell chrome (header / sidebar rendered by RootLayout are hidden via compact=1).
 *   - Dark, side-tinted background.
 *   - Minimal status strip: "{game} · {map} · {side}" + "Exit" button.
 *   - Cards stacked vertically (1-col narrow, 2-col wide), EXTRA large screenshots.
 *
 * Arrow left/right keyboard shortcuts (handled by useMapKeyboardShortcuts) cycle
 * the highlighted card via the activeCardIndex prop.
 */
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { Game, MapDetail, Lineup } from "@/types/game";
import type { UsePinsReturn } from "@/hooks/usePins";
import RoundModeBody from "@/components/roundMode/RoundModeBody";

const SIDE_BG: Record<string, string> = {
  side_a: "rgba(239,68,68,0.08)",
  side_b: "rgba(59,130,246,0.08)",
  any: "rgba(0,0,0,0)",
};

const SIDE_LABELS_GENERIC: Record<string, string> = {
  side_a: "Side A",
  side_b: "Side B",
  any: "Any side",
};

interface RoundModeProps {
  game: Game | undefined;
  mapDetail: MapDetail;
  side: string;
  pinnedLineups: Lineup[];
  isFetching: boolean;
  activeCardIndex: number;
  exitHref: string;
  pins: UsePinsReturn;
  /** Base href for "Open plan mode" link when 0 pins */
  planModeHref: string;
}

export default function RoundMode({
  game,
  mapDetail,
  side,
  pinnedLineups,
  isFetching,
  activeCardIndex,
  exitHref,
  pins,
  planModeHref,
}: RoundModeProps) {
  const sideBg = SIDE_BG[side] ?? "rgba(0,0,0,0)";

  const sideLabel =
    side === "side_a"
      ? (game?.side_a_label ?? SIDE_LABELS_GENERIC.side_a)
      : side === "side_b"
        ? (game?.side_b_label ?? SIDE_LABELS_GENERIC.side_b)
        : SIDE_LABELS_GENERIC.any;

  return (
    <div
      data-testid="round-mode"
      className="min-h-screen bg-background transition-colors duration-300"
      style={{ background: `color-mix(in srgb, hsl(var(--background)) 92%, ${sideBg})` }}
    >
      {/* Minimal status strip */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <p className="text-sm font-medium text-muted-foreground">
          <span className="text-foreground">{game?.name ?? "Game"}</span>
          {" · "}
          <span className="text-foreground capitalize">{mapDetail.name}</span>
          {" · "}
          <span>{sideLabel}</span>
        </p>
        <Link
          to={exitHref}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted/40 transition-colors min-h-[36px]"
          aria-label="Exit round mode"
        >
          <X className="w-4 h-4" />
          Exit round mode
        </Link>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6">
        <RoundModeBody
          isFetching={isFetching}
          pinnedLineups={pinnedLineups}
          activeCardIndex={activeCardIndex}
          pins={pins}
          planModeHref={planModeHref}
        />
      </div>
    </div>
  );
}
