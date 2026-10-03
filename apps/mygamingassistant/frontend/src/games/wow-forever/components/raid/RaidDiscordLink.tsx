import { ExternalLink } from "lucide-react";
import { RAID_BUTTON_CLASS } from "@/games/wow-forever/data/raidPage";

interface RaidDiscordLinkProps {
  /** The raid's post in Discord; it opens for members of the raid's server only. */
  url: string;
}

/** [Open in Discord] — to the raid's post, where sign-ups happen. */
export default function RaidDiscordLink({ url }: RaidDiscordLinkProps) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={RAID_BUTTON_CLASS}>
      <ExternalLink className="h-4 w-4" aria-hidden />
      Open in Discord{" "}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
