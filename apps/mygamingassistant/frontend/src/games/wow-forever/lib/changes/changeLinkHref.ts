import { TALENT_PICK_PARAM, TALENTS_PATH } from "@/games/wow-forever/data/talents/talentConfig";
import { worldMapZoneHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import { itemPageHref } from "@/games/wow-forever/lib/itemPages/itemPageHref";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { ChangeLink } from "@/games/wow-forever/types/changes/changeLink";

/** Our own page for a row: `/wow-forever/items/647`, `/wow-forever/quests/1234`, `/wow-forever/talents/druid?talent=762`, `/wow-forever/map?m=2482`. */
export function changeLinkHref(link: ChangeLink): string {
  switch (link[0]) {
    case "item":
      return itemPageHref(link[1]);
    case "quest":
      return questPageHref(link[1]);
    case "talent":
      return `${TALENTS_PATH}/${link[1]}?${TALENT_PICK_PARAM}=${link[2]}`;
    case "map":
      return worldMapZoneHref(link[1]);
  }
}
