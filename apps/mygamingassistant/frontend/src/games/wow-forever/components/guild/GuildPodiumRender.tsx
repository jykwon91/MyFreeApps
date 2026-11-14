import { UserRound } from "lucide-react";
import { useImageFailed } from "@/games/wow-forever/hooks/useImageFailed";
import { characterRenderUrl } from "@/games/wow-forever/lib/character/characterRenderUrl";
import { PODIUM_RENDER_CLASSES } from "@/games/wow-forever/data/guild/guildStyles";

interface GuildPodiumRenderProps {
  slug: string;
  /** 1st place (and anyone tied for it): the tallest picture; 2nd and 3rd are a size down. */
  champion: boolean;
}

/**
 * A top-3 member in their gear: Blizzard's render, small beside the name on a phone and above it on wide
 * screens. Decorative (the name is right next to it). When Blizzard has no picture, a plain silhouette keeps the
 * space, so the card doesn't jump.
 */
export default function GuildPodiumRender({ slug, champion }: GuildPodiumRenderProps) {
  const src = characterRenderUrl(slug);
  const { failed, onError } = useImageFailed(src);
  const classes = PODIUM_RENDER_CLASSES[champion ? "champion" : "runnerUp"];
  if (failed) {
    return (
      <span className={classes.missing} data-testid="guild-podium-render-missing">
        <UserRound aria-hidden className={classes.icon} />
      </span>
    );
  }
  return <img src={src} alt="" className={classes.image} onError={onError} data-testid="guild-podium-render" />;
}
