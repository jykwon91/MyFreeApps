import { useState } from "react";
import ScreenshotReader from "@/games/wow-forever/components/compare/ScreenshotReader";
import TextReader from "@/games/wow-forever/components/compare/TextReader";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

type InputMode = "text" | "screenshot";

const INPUT_MODES: readonly { id: InputMode; label: string }[] = [
  { id: "text", label: "Paste text" },
  { id: "screenshot", label: "Screenshot" },
];

interface ItemInputPanelProps {
  itemLabel: string;
  onTextRead: (parsed: ParsedTooltip) => void;
  onScreenshotRead: (response: ItemExtractionResponse) => void;
}

export default function ItemInputPanel({ itemLabel, onTextRead, onScreenshotRead }: ItemInputPanelProps) {
  const [mode, setMode] = useState<InputMode>("text");
  return (
    <div className="space-y-3">
      <SegmentedToggle label={`How to add ${itemLabel}`} options={INPUT_MODES} value={mode} onChange={setMode} />
      {mode === "text" ? <TextReader itemLabel={itemLabel} onRead={onTextRead} /> : null}
      {mode === "screenshot" ? <ScreenshotReader onRead={onScreenshotRead} /> : null}
    </div>
  );
}
