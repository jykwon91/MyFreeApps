import { cn } from "@platform/ui";
import { RAID_ICON_BASE } from "@/games/wow-forever/data/raidPage";

interface RaidIconProps {
  /** The icon's name in the bot's set: "warrior_fury", "role_tank", "status_late"… */
  name: string;
  /** The page's `icons_version`, so a new set is never served from an old cache. */
  version: string;
  /** "" when the text beside it already says what it shows. */
  alt: string;
  className?: string;
}

/** One of the bot's own icons — the art its Discord post uses — at 20×20. */
export default function RaidIcon({ name, version, alt, className }: RaidIconProps) {
  return (
    <img
      src={`${RAID_ICON_BASE}/${encodeURIComponent(name)}.png?v=${encodeURIComponent(version)}`}
      alt={alt}
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      className={cn("h-5 w-5 shrink-0 rounded-sm", className)}
    />
  );
}
