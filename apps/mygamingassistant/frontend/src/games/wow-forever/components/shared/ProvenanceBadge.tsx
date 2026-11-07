import ProvenanceChip from "@/games/wow-forever/components/shared/ProvenanceChip";
import ProvenanceTooltip from "@/games/wow-forever/components/shared/ProvenanceTooltip";
import { PROVENANCE_BADGE_HINT } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/**
 * Where one fact comes from — the one badge every WoW Forever page uses. Hover,
 * keyboard focus or a tap shows what the tag means; the tap area is enlarged
 * past the small chip so it's a phone-sized target without moving the text.
 */
export default function ProvenanceBadge({ provenance, detail, date }: ProvenanceTag) {
  const { open, tooltipId, triggerProps, setReference, setFloating, floatingStyles, isPositioned, placement } =
    useHoverTooltip({ toggleOnTap: true });
  return (
    <>
      <button
        type="button"
        ref={setReference}
        data-testid="provenance-badge"
        data-provenance={provenance}
        aria-expanded={open}
        className="relative inline-flex align-middle rounded before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...triggerProps}
      >
        <ProvenanceChip provenance={provenance} date={date} />
        <span className="sr-only">{PROVENANCE_BADGE_HINT}</span>
      </button>
      {open ? (
        <ProvenanceTooltip
          id={tooltipId}
          provenance={provenance}
          detail={detail}
          setFloating={setFloating}
          floatingStyles={floatingStyles}
          isPositioned={isPositioned}
          placement={placement}
        />
      ) : null}
    </>
  );
}
