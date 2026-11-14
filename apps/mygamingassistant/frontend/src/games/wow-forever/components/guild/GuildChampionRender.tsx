import { UserRound } from "lucide-react";
import { useImageFailed } from "@/games/wow-forever/hooks/useImageFailed";
import { characterRenderUrl } from "@/games/wow-forever/lib/character/characterRenderUrl";
import { PODIUM_RENDER, PODIUM_RENDER_MISSING } from "@/games/wow-forever/data/guild/guildStyles";

interface GuildChampionRenderProps {
  slug: string;
}

/**
 * The Arena champion in their gear: Blizzard's render, small beside the name on a phone and above it on wide
 * screens. Decorative (the name is right next to it). When Blizzard has no picture, a plain silhouette keeps the
 * space, so the card doesn't jump.
 */
export default function GuildChampionRender({ slug }: GuildChampionRenderProps) {
  const src = characterRenderUrl(slug);
  const { failed, onError } = useImageFailed(src);
  if (failed) {
    return (
      <span className={PODIUM_RENDER_MISSING} data-testid="guild-champion-render-missing">
        <UserRound aria-hidden className="h-8 w-8 sm:h-14 sm:w-14" />
      </span>
    );
  }
  return <img src={src} alt="" className={PODIUM_RENDER} onError={onError} data-testid="guild-champion-render" />;
}
