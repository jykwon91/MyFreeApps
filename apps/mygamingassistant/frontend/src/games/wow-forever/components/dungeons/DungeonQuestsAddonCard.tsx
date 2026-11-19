import { Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button, showSuccess } from "@platform/ui";
import {
  DUNGEON_QUESTS_ADDON_OPEN_PARAM,
  DUNGEON_QUESTS_ADDON_OPEN_VALUE,
} from "@/games/wow-forever/data/dungeonQuestsAddon/dungeonQuestsAddonLink";
import { DUNGEON_QUESTS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/dungeonQuestsAddon/dungeonQuestsAddonFiles";
import { dungeonQuestsAddonZip } from "@/games/wow-forever/lib/dungeonQuestsAddon/dungeonQuestsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

function download() {
  downloadZip(dungeonQuestsAddonZip(), DUNGEON_QUESTS_ADDON_ZIP_NAME);
  showSuccess("MGA Dungeon Quests is downloading. Unzip it into your AddOns folder.");
}

/** "See your dungeon quests in game": the MGA Dungeon Quests addon download and how to install it. Folded until opened (or linked with `?addon=open`). */
export default function DungeonQuestsAddonCard() {
  const [params] = useSearchParams();
  const open = params.get(DUNGEON_QUESTS_ADDON_OPEN_PARAM) === DUNGEON_QUESTS_ADDON_OPEN_VALUE;
  return (
    <details
      id="dungeon-quests-addon"
      className="rounded-md border border-border bg-card p-3 text-sm"
      data-testid="dungeon-quests-addon"
      open={open}
    >
      <summary className="min-h-[44px] flex items-center cursor-pointer font-medium">See your dungeon quests in game</summary>
      <div className="space-y-3 pt-2">
        <p>
          Type <code>/mgadq</code> to open a dungeon journal in game: every dungeon, with how many of its quests you still need
          to pick up. Open one for its bosses and what they drop, and each quest line in order, ticked from the quests the game
          says you&apos;ve done, with what to do next: who to get it from and where, what to kill or collect, or who to turn it
          in to. Route shows the quickest way there from where you stand, by foot, flight path, boat or zeppelin, and moves the map pin along as you go. Any quest you&apos;ve finished, dungeon or not, gets a pin on your World Map at
          whoever takes it back, and <code>/mgadq turnin</code> (or the map&apos;s Route turn-ins button) takes you to them all in
          the quickest order. It also reminds you in chat when you enter a dungeon with quests you
          haven&apos;t picked up, and notes where each Craftsman&apos;s Writ you pick up is delivered, for the Crafting writs page.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Download the addon.</li>
          <li>
            Unzip it into <code className="break-all">World of Warcraft\_forever_\Interface\AddOns</code>, so you have an{" "}
            <code>AddOns\MGADungeonQuests</code> folder.
          </li>
          <li>
            Restart the game, or type <code>/reload</code>.
          </li>
          <li>
            Type <code>/mgadq</code> to open it. <code>/mgadq remind off</code> turns the chat reminder off, <code>/mgadq pins off</code> the map pins.
          </li>
        </ol>
        <Button onClick={download} data-testid="dungeon-quests-addon-download">
          <span className="flex items-center gap-2">
            <Download size={16} aria-hidden />
            Download the addon
          </span>
        </Button>
      </div>
    </details>
  );
}
