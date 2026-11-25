import { skipToken } from "@reduxjs/toolkit/query/react";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { characterNameFromSlug } from "@/games/wow-forever/lib/character/characterSlug";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** Blizzard's data is as of the last log out; ask again this often while the site is open. */
export const CHARACTER_REFRESH_MS = 5 * 60 * 1000;

export interface SelectedCharacter {
  slug: string | null;
  /** "Jason Kwon"; null with no character selected. */
  name: string | null;
  /** Undefined until Blizzard answers (or when it can't). */
  character: CharacterResponse | undefined;
}

/** The character "Use for MGA's pages" selected, read from Blizzard (RTK's cache is shared by every caller). */
export function useSelectedCharacter(): SelectedCharacter {
  const [{ characterSlug }] = usePlayerSettings();
  const { data } = useGetCharacterQuery(characterSlug ?? skipToken, {
    pollingInterval: CHARACTER_REFRESH_MS,
    skipPollingIfUnfocused: true,
  });
  const character = data && data.slug === characterSlug ? data : undefined;
  let name: string | null = null;
  if (character) name = [character.name, character.surname].filter(Boolean).join(" ");
  else if (characterSlug) name = characterNameFromSlug(characterSlug);
  return { slug: characterSlug, name, character };
}
