/**
 * MapPageTopBar — the slim sticky filter strip across the top of MapPage.
 *
 * Extracted from MapPage.tsx so the page stays under the 500-LOC growth
 * guard set in scripts/file-size-allowlist.yml. Pure presentation +
 * callbacks — no URL state, no data fetching; the parent owns those.
 *
 * Layout (~40px tall, single horizontal row, x-scrolls if needed):
 *
 *   [← Game · Map] | [Side chips] | [Util chips] | [Loadout chips]
 *                                              ⋯  [Δ List|Grid] [?] [⚙]
 */
import { ArrowLeft, HelpCircle, LayoutGrid, List } from "lucide-react";
import GlanceBoardOperatorMenu from "@/components/lineup/GlanceBoardOperatorMenu";

interface ChipOption {
  value: string;
  label: string;
}

interface MapPageTopBarProps {
  gameSlug: string;
  mapSlug: string;
  gameName: string;
  mapName: string;

  // Side filter
  side: string;
  sideChips: ChipOption[];
  onSideChange: (newSide: string) => void;

  // Utility-type filter
  utilOptions: ChipOption[];
  selectedUtils: string[];
  onUtilChipToggle: (slug: string) => void;

  // Loadout chips (same option set as utilOptions but persisted separately)
  loadout: string[];
  onLoadoutToggle: (slug: string) => void;

  // View mode (list / grid) — drives the right-side toggle pill.
  viewMode: "list" | "grid";
  onViewToggle: (next: "list" | "grid") => void;

  // Operator menu surface
  isSuperuser: boolean;
  unplaceableCount: number;
  onReplaceMinimapClick: () => void;

  // Navigation + dialogs
  onBackClick: () => void;
  onShortcutsClick: () => void;
}

export default function MapPageTopBar({
  gameSlug,
  mapSlug,
  gameName,
  mapName,
  side,
  sideChips,
  onSideChange,
  utilOptions,
  selectedUtils,
  onUtilChipToggle,
  loadout,
  onLoadoutToggle,
  viewMode,
  onViewToggle,
  isSuperuser,
  unplaceableCount,
  onReplaceMinimapClick,
  onBackClick,
  onShortcutsClick,
}: MapPageTopBarProps) {
  return (
    <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b h-10 flex items-center gap-2 px-3 shrink-0 overflow-x-auto">

      {/* Back + map name */}
      <button
        type="button"
        onClick={onBackClick}
        className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors shrink-0"
        aria-label="Back to maps"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
        <span className="hidden sm:inline text-xs text-muted-foreground">{gameName} ·</span>
        <span className="text-sm font-semibold text-foreground capitalize">{mapName}</span>
      </button>

      <span className="text-border shrink-0">|</span>

      {/* Side chips */}
      <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Side filter">
        {sideChips.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSideChange(opt.value)}
            className={[
              "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
              side === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            ].join(" ")}
            aria-pressed={side === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <span className="text-border shrink-0">|</span>

      {/* Utility type chips */}
      {utilOptions.length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Utility type filter">
          {utilOptions.map((opt) => {
            const active = selectedUtils.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUtilChipToggle(opt.value)}
                className={[
                  "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                ].join(" ")}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loadout chips — persistent inline toggle strip. Composable with
          utility chips; default empty = no filter. */}
      {utilOptions.length > 0 && (
        <>
          <span className="text-border shrink-0">|</span>
          <div
            className="flex items-center gap-0.5 shrink-0"
            role="group"
            aria-label="Loadout filter — utilities you are carrying this round"
          >
            {utilOptions.map((opt) => {
              const inLoadout = loadout.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onLoadoutToggle(opt.value)}
                  className={[
                    "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border",
                    inLoadout
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-400"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  ].join(" ")}
                  aria-pressed={inLoadout}
                  title={`${inLoadout ? "Remove" : "Add"} ${opt.label} from loadout`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* View toggle — List (default) vs Grid. List defers all video
          decoding until the operator expands a row; Grid auto-loops every
          visible tile's 4 panes. Persisted via ?view URL param by parent. */}
      <div
        className="flex items-center rounded-md border bg-card/40 shrink-0"
        role="group"
        aria-label="Lineup view mode"
      >
        <button
          type="button"
          onClick={() => onViewToggle("list")}
          aria-pressed={viewMode === "list"}
          aria-label="List view — compact text rows, click a row to expand"
          title="List view (default — lower browser CPU)"
          className={[
            "p-1 transition-colors rounded-l-md",
            viewMode === "list"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          ].join(" ")}
        >
          <List className="w-3.5 h-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onViewToggle("grid")}
          aria-pressed={viewMode === "grid"}
          aria-label="Grid view — full storyboard tiles always visible"
          title="Grid view (auto-loops every visible tile)"
          className={[
            "p-1 transition-colors rounded-r-md",
            viewMode === "grid"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          ].join(" ")}
        >
          <LayoutGrid className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      {/* Help shortcut */}
      <button
        type="button"
        onClick={onShortcutsClick}
        className="p-1 rounded hover:bg-muted/40 text-muted-foreground transition-colors shrink-0"
        aria-label="Keyboard shortcuts (?)"
        title="Keyboard shortcuts"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden />
      </button>

      {/* Operator ⚙ menu */}
      <GlanceBoardOperatorMenu
        gameSlug={gameSlug}
        mapSlug={mapSlug}
        isSuperuser={isSuperuser}
        unplaceableCount={unplaceableCount}
        onReplaceMinimapClick={onReplaceMinimapClick}
      />
    </header>
  );
}
