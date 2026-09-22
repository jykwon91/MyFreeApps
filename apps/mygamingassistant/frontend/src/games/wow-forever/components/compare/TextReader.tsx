import { useState } from "react";
import { Button } from "@platform/ui";
import { parseTooltipText, type ParsedTooltip } from "@/games/wow-forever/parsing/parseTooltipText";

interface TextReaderProps {
  itemLabel: string;
  onRead: (parsed: ParsedTooltip) => void;
}

const MAX_TEXT_CHARS = 4000;

/** Paste a tooltip's text and read it in the browser — no upload, no account. */
export default function TextReader({ itemLabel, onRead }: TextReaderProps) {
  const [text, setText] = useState("");
  const textareaId = `tooltip-text-${itemLabel.replace(/\W+/g, "-")}`;
  return (
    <div className="space-y-2">
      <label htmlFor={textareaId} className="text-xs font-medium text-muted-foreground">
        Paste tooltip text copied from a site like Wowhead (name on the first line)
      </label>
      <textarea
        id={textareaId}
        value={text}
        maxLength={MAX_TEXT_CHARS}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"Example:\nBlackhand's Breadth\nTrinket\nEquip: Improves your chance to get a critical strike by 2%."}
        className="w-full border rounded-md px-3 py-2 text-sm bg-card font-mono"
      />
      <Button variant="secondary" size="sm" disabled={text.trim() === ""} onClick={() => onRead(parseTooltipText(text))}>
        Read text
      </Button>
    </div>
  );
}
