import { MIN_ITEM_QUERY_LENGTH } from "@/games/wow-forever/data/itemSearchConfig";

interface ItemSearchHintProps {
  /** True once something (but too little) is typed. */
  tooShort: boolean;
  exampleNames: readonly string[];
}

/** What to type, before there's enough to search for. */
export default function ItemSearchHint({ tooShort, exampleNames }: ItemSearchHintProps) {
  if (tooShort) {
    return (
      <p className="text-sm text-muted-foreground">Type at least {MIN_ITEM_QUERY_LENGTH} letters of the item's name.</p>
    );
  }
  const examples = exampleNames.map((n) => `“${n}”`).join(" or ");
  return (
    <p className="text-sm text-muted-foreground">
      Type the item's name{examples ? `, like ${examples}` : ""}. Any word order works, and the start of a word is
      enough.
    </p>
  );
}
