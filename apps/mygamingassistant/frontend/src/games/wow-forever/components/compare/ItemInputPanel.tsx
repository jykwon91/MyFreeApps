import { useState } from "react";
import ItemSearchPanel from "@/games/wow-forever/components/compare/ItemSearchPanel";
import ScreenshotReader from "@/games/wow-forever/components/compare/ScreenshotReader";
import TextReader from "@/games/wow-forever/components/compare/TextReader";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { INPUT_MODE, INPUT_MODES, type InputMode } from "@/games/wow-forever/data/itemInputModes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import type { ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

interface ItemInputPanelProps {
  item: CompareItem;
  itemLabel: string;
  classId: WowClassId;
  bracket: WeightBracket;
  onPick: (record: ClientItem, clientBuild: string) => void;
  onEnterByHand: (query: string) => void;
  onTextRead: (parsed: ParsedTooltip) => void;
  onScreenshotRead: (response: ItemExtractionResponse) => void;
}

export default function ItemInputPanel({
  item,
  itemLabel,
  classId,
  bracket,
  onPick,
  onEnterByHand,
  onTextRead,
  onScreenshotRead,
}: ItemInputPanelProps) {
  const [mode, setMode] = useState<InputMode>(INPUT_MODE.SEARCH);
  return (
    <div className="space-y-3">
      <SegmentedToggle
        label={`How to add ${itemLabel}`}
        options={INPUT_MODES}
        value={mode}
        onChange={setMode}
        className="flex-wrap"
      />
      {/* Kept mounted (hidden) so the query survives a look at another tab. */}
      <div hidden={mode !== INPUT_MODE.SEARCH}>
        <ItemSearchPanel
          item={item}
          itemLabel={itemLabel}
          classId={classId}
          bracket={bracket}
          onPick={onPick}
          onEnterByHand={onEnterByHand}
          onSwitchMode={setMode}
        />
      </div>
      {mode === INPUT_MODE.SCREENSHOT ? <ScreenshotReader onRead={onScreenshotRead} /> : null}
      {mode === INPUT_MODE.TEXT ? <TextReader itemLabel={itemLabel} onRead={onTextRead} /> : null}
    </div>
  );
}
