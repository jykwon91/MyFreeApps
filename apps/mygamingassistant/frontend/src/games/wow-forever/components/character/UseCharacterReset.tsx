import { Button } from "@platform/ui";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";

/** "Use Jason Kwon's": shown only while a typed value is over the selected character's own. */
export default function UseCharacterReset({ state }: { state: CharacterDefaultState | null }) {
  if (!state?.overridden) return null;
  return (
    <Button type="button" variant="secondary" size="sm" onClick={state.reset} className="min-h-[44px] sm:min-h-[36px]">
      Use {state.characterName}&apos;s
    </Button>
  );
}
