import { WEAPON_NOTE } from "@/games/wow-forever/data/bisLists/bisSlots";

/** What a list is and isn't: saved here only, shared in the link itself, sources from Classic data. */
export default function BisListFootnote() {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <p>{WEAPON_NOTE}</p>
      <p>
        Lists are saved in this browser only. A copied link carries the whole list inside the link itself; nothing is
        sent to a server.
      </p>
      <p>
        Quest and boss-drop sources are Classic data and may differ in Forever. Each item's page lists every source.
      </p>
    </div>
  );
}
