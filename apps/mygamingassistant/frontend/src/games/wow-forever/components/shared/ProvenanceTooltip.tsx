import type { Placement } from "@floating-ui/react-dom";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PROVENANCE_DESCRIPTION, PROVENANCE_LABEL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

interface ProvenanceTooltipProps extends ProvenanceTag {
  id: string;
  setFloating: (node: HTMLElement | null) => void;
  floatingStyles: CSSProperties;
  /** Hidden until Floating UI has placed it, so it never flashes at the corner of the page. */
  isPositioned: boolean;
  placement: Placement;
}

/** What a provenance badge means, portalled to `<body>` so no `overflow` container clips it. */
export default function ProvenanceTooltip({
  id,
  provenance,
  detail,
  setFloating,
  floatingStyles,
  isPositioned,
  placement,
}: ProvenanceTooltipProps) {
  return createPortal(
    <div
      ref={setFloating}
      id={id}
      role="tooltip"
      data-testid="provenance-tooltip"
      data-placement={placement}
      style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
      className="pointer-events-none z-50 w-64 max-w-[calc(100vw-16px)] space-y-1 rounded-lg border bg-card p-3 text-xs shadow-lg"
    >
      <p className="font-semibold">{PROVENANCE_LABEL[provenance]}</p>
      <p className="text-muted-foreground">{PROVENANCE_DESCRIPTION[provenance]}</p>
      {detail ? <p className="text-muted-foreground">{detail}</p> : null}
    </div>,
    document.body,
  );
}
