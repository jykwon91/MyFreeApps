/**
 * "Did you mean Tirisfal Glades?" — when nothing matches what was typed,
 * each misspelt word is swapped for the nearest word any NPC, dungeon, boss
 * or place name actually uses ("tristfal" -> "tirisfal"). A word that's
 * already part of a real word is left alone.
 */
import type { Place } from "@/games/wow-forever/worldMap/places";
import { allowedEdits, editDistance, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";

/** Every word the search knows, with how often it's used (the commoner wins a tie). */
export type Vocabulary = ReadonlyMap<string, number>;

export function buildVocabulary(texts: Iterable<string>): Vocabulary {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const word of normalizeText(text).split(" ")) {
      if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

/** The place, NPC and dungeon names (and the words around them) the search box looks in. */
export function placeTexts(places: readonly Place[]): string[] {
  return places.flatMap((p) => [p.name, p.zoneName, p.town ?? "", ...p.aliases]);
}

function closestWord(token: string, vocabulary: Vocabulary): string | null {
  const allowed = allowedEdits(token.length);
  if (allowed === 0) return null;
  let best: { word: string; edits: number; count: number } | null = null;
  for (const [word, count] of vocabulary) {
    if (Math.abs(word.length - token.length) > allowed) continue;
    const edits = editDistance(token, word);
    if (edits > allowed) continue;
    if (!best || edits < best.edits || (edits === best.edits && count > best.count)) best = { word, edits, count };
  }
  return best?.word ?? null;
}

/** The query with its misspelt words fixed, or null when every word is fine or one can't be fixed. */
export function correctSpelling(query: string, vocabulary: Vocabulary): string | null {
  const words = [...vocabulary.keys()];
  let changed = false;
  const fixed: string[] = [];
  for (const token of queryTokens(query)) {
    if (vocabulary.has(token) || words.some((w) => w.includes(token))) {
      fixed.push(token);
      continue;
    }
    const word = closestWord(token, vocabulary);
    if (!word) return null;
    fixed.push(word);
    changed = true;
  }
  return changed ? fixed.join(" ") : null;
}

const vocabularies = new WeakMap<readonly Place[], Vocabulary>();

/** One vocabulary per map data + places, built on the first misspelling. */
export function vocabularyFor(places: readonly Place[], npcTexts: () => Iterable<string>): Vocabulary {
  let vocabulary = vocabularies.get(places);
  if (!vocabulary) {
    vocabulary = buildVocabulary([...placeTexts(places), ...npcTexts()]);
    vocabularies.set(places, vocabulary);
  }
  return vocabulary;
}
