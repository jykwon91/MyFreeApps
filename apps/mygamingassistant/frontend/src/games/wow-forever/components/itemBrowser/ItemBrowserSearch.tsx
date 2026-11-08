import { ITEM_BROWSER_TEXT, ITEM_QUERY_MAX_LENGTH } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";

interface ItemBrowserSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** The name search: every word, any order; a typo still finds the item when nothing matches exactly. */
export default function ItemBrowserSearch({ value, onChange }: ItemBrowserSearchProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="item-browser-search" className="text-sm font-medium">
        {ITEM_BROWSER_TEXT.searchLabel}
      </label>
      <input
        id="item-browser-search"
        type="search"
        autoComplete="off"
        maxLength={ITEM_QUERY_MAX_LENGTH}
        placeholder={ITEM_BROWSER_TEXT.searchPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-md border bg-card px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary sm:text-sm"
        data-testid="item-browser-search"
      />
    </div>
  );
}
