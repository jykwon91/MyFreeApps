import { useState } from "react";
import ScreenshotReader from "@/games/wow-forever/components/compare/ScreenshotReader";
import TextReader from "@/games/wow-forever/components/compare/TextReader";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { INPUT_MODE, type InputMode } from "@/games/wow-forever/data/itemInputModes";
import { isScreenshotReaderOffered } from "@/games/wow-forever/lib/itemReaderAvailability";
import type { ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

// Screenshot comes first: in-game tooltips can't be copied as text, so a
// screenshot is how most items get in. Pasting text is for tooltips copied
// from a website.
const INPUT_MODES: readonly { id: InputMode; label: string }[] = [
  { id: INPUT_MODE.SCREENSHOT, label: "Screenshot" },
  { id: INPUT_MODE.TEXT, label: "Paste from a website" },
];

function defaultMode(): InputMode {
  if (isScreenshotReaderOffered()) return INPUT_MODE.SCREENSHOT;
  return INPUT_MODE.TEXT;
}

interface ItemInputPanelProps {
  itemLabel: string;
  onTextRead: (parsed: ParsedTooltip) => void;
  onScreenshotRead: (response: ItemExtractionResponse) => void;
}

export default function ItemInputPanel({ itemLabel, onTextRead, onScreenshotRead }: ItemInputPanelProps) {
  const [mode, setMode] = useState<InputMode>(defaultMode);
  return (
    <div className="space-y-3">
      <SegmentedToggle label={`How to add ${itemLabel}`} options={INPUT_MODES} value={mode} onChange={setMode} />
      {mode === INPUT_MODE.SCREENSHOT ? <ScreenshotReader onRead={onScreenshotRead} /> : null}
      {mode === INPUT_MODE.TEXT ? <TextReader itemLabel={itemLabel} onRead={onTextRead} /> : null}
    </div>
  );
}
