import type { ReactNode } from "react";
import { Panel, PanelCloseButton, PanelTitle } from "@platform/ui";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";

interface TriageSheetFrameProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The sticky bottom row (Save / Cancel). */
  footer?: ReactNode;
}

/** Every triage sheet: a bottom sheet on a phone, a right-hand panel on a desktop (the shared Panel). */
export default function TriageSheetFrame({ title, onClose, children, footer }: TriageSheetFrameProps) {
  return (
    <Panel position="right" width="520px" onClose={onClose}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <PanelTitle asChild>
          <h2 className="text-base font-semibold">{title}</h2>
        </PanelTitle>
        <PanelCloseButton onClose={onClose} label={TRIAGE_COPY.close} />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      {footer !== undefined ? <div className="flex flex-wrap justify-end gap-2 border-t p-4">{footer}</div> : null}
    </Panel>
  );
}
