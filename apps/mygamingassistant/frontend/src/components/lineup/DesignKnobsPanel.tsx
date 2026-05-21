/**
 * DesignKnobsPanel — floating bottom-right panel for direct-manipulation
 * tuning of the storyboard tile. Collapsed to a small chip by default;
 * click to expand a panel with the five knobs.
 *
 * The panel is wired to URL params via `useDesignKnobs` so refresh and
 * link-sharing preserve the chosen combination. Once the operator settles
 * on a preferred default, they tell the assistant which combo to lock in
 * as the shipped default in `DEFAULT_KNOBS`.
 */
import { useState } from "react";
import { Settings2, X, RotateCcw } from "lucide-react";
import { useDesignKnobs } from "@/hooks/useDesignKnobs";
import type { PaneMode, LandingMode, TilesPerRow } from "@/hooks/useDesignKnobs";

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<{ label: string; value: T }>;
  onChange: (next: T) => void;
}

function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex rounded-md border border-border overflow-hidden">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              className={[
                "px-2.5 py-1 text-[11px] font-medium transition-colors",
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
    </div>
  );
}

export default function DesignKnobsPanel() {
  const { knobs, setKnob, reset } = useDesignKnobs();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/90 border border-border shadow-md hover:bg-muted/60 transition-colors text-[11px] font-medium text-muted-foreground"
        aria-label="Open design knobs"
        title="Design knobs"
      >
        <Settings2 className="w-3.5 h-3.5" aria-hidden />
        Design
      </button>
    );
  }

  return (
    <aside
      role="dialog"
      aria-label="Design knobs"
      className="fixed bottom-4 right-4 z-30 w-[260px] rounded-lg border border-border bg-background shadow-xl p-3 space-y-2.5"
    >
      <header className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Design knobs
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
            aria-label="Reset to defaults"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
            aria-label="Close design knobs"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </header>

      <Segmented<PaneMode>
        label="Stand"
        value={knobs.standMode}
        options={[
          { label: "Still", value: "still" },
          { label: "Clip",  value: "clip"  },
        ]}
        onChange={(v) => setKnob("standMode", v)}
      />

      <Segmented<PaneMode>
        label="Aim"
        value={knobs.aimMode}
        options={[
          { label: "Still", value: "still" },
          { label: "Clip",  value: "clip"  },
        ]}
        onChange={(v) => setKnob("aimMode", v)}
      />

      <Segmented<"on" | "off">
        label="Aim dot"
        value={knobs.showAimDot ? "on" : "off"}
        options={[
          { label: "On",  value: "on"  },
          { label: "Off", value: "off" },
        ]}
        onChange={(v) => setKnob("showAimDot", v === "on")}
      />

      <Segmented<LandingMode>
        label="Landing"
        value={knobs.landingMode}
        options={[
          { label: "Clip", value: "clip" },
          { label: "Text", value: "text" },
        ]}
        onChange={(v) => setKnob("landingMode", v)}
      />

      <Segmented<TilesPerRow>
        label="Per row"
        value={knobs.tilesPerRow}
        options={[
          { label: "1", value: 1 },
          { label: "2", value: 2 },
          { label: "3", value: 3 },
        ]}
        onChange={(v) => setKnob("tilesPerRow", v)}
      />

      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
        URL-backed — refresh keeps choices. Tell me the combo you like and I'll lock it in as the default.
      </p>
    </aside>
  );
}
