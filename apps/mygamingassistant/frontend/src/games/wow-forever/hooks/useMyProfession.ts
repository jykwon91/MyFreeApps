import { useMemo } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { playerSettingsFromCharacter } from "@/games/wow-forever/lib/character/characterPlayerSettings";
import { myProfession } from "@/games/wow-forever/lib/trainers/myProfession";
import { playerFactionLabel } from "@/games/wow-forever/data/playerFactionOptions";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { MyProfessionState } from "@/games/wow-forever/types/trainers/myProfessionState";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

/**
 * The character "Use for MGA's pages" saved, read for `profession` (null = not a crafting profession,
 * nothing is fetched). A saved name Blizzard no longer knows reads as no character.
 */
export function useMyProfession(profession: CraftingProfession | null, pageFaction: PlayerFaction): MyProfessionState {
  const [{ characterSlug }] = usePlayerSettings();
  const slug = profession ? characterSlug : null;
  const { data, error, isFetching, refetch } = useGetCharacterQuery(slug ?? skipToken);
  return useMemo((): MyProfessionState => {
    if (!slug || !profession) return { kind: "none" };
    if (data) {
      const mine = myProfession(data, profession);
      if (!mine) return { kind: "not-learned", characterName: [data.name, data.surname].filter(Boolean).join(" ") };
      const theirFaction = playerSettingsFromCharacter(data)?.faction ?? null;
      const otherFaction = theirFaction && theirFaction !== pageFaction ? playerFactionLabel(theirFaction) : null;
      return { kind: "ready", mine, lastLogin: data.last_login, otherFaction };
    }
    if (error) return isNotFound(error) ? { kind: "none" } : { kind: "error", retry: () => void refetch(), retrying: isFetching };
    return { kind: "loading" };
  }, [slug, profession, data, error, isFetching, refetch, pageFaction]);
}
