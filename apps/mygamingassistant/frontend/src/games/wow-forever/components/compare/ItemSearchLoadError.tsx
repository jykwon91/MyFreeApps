import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import { INPUT_MODE, type InputMode } from "@/games/wow-forever/data/itemInputModes";

interface ItemSearchLoadErrorProps {
  onRetry: () => void;
  retrying: boolean;
  onSwitchMode: (mode: InputMode) => void;
}

const LINK = "underline underline-offset-2 hover:text-foreground min-h-[44px] sm:min-h-0";

/** The item list didn't load: retry in place (no page refresh in Discord), or add the item another way. */
export default function ItemSearchLoadError({ onRetry, retrying, onSwitchMode }: ItemSearchLoadErrorProps) {
  return (
    <div className="space-y-2">
      <LoadErrorRetry
        message="Couldn't load the item list. Check your connection and try again."
        onRetry={onRetry}
        retrying={retrying}
      />
      <p className="text-sm text-muted-foreground">
        Or add the item another way:{" "}
        <button type="button" className={LINK} onClick={() => onSwitchMode(INPUT_MODE.TEXT)}>
          paste its text
        </button>{" "}
        or{" "}
        <button type="button" className={LINK} onClick={() => onSwitchMode(INPUT_MODE.SCREENSHOT)}>
          read a screenshot
        </button>
        .
      </p>
    </div>
  );
}
