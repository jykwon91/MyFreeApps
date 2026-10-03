import { RAID_FOCUS_RING_CLASS } from "@/games/wow-forever/data/raidPage";

const LINK_CLASS = `underline underline-offset-2 ${RAID_FOCUS_RING_CLASS}`;

/** The icons' and banners' credit, which their licence (CC BY 3.0) asks for. */
export default function RaidCredits() {
  return (
    <p className="text-xs text-muted-foreground">
      Icons and banner art from{" "}
      <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        game-icons.net
      </a>{" "}
      by Lorc, Delapouite, Sbed and Zeromancer, under{" "}
      <a
        href="https://creativecommons.org/licenses/by/3.0/"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        CC BY 3.0
      </a>
      ; recoloured and resized.
    </p>
  );
}
