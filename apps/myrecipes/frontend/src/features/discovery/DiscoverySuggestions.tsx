import { DISCOVERY_SUGGESTIONS } from "@myrecipes/api-client/constants/discovery";

interface Props {
  onPick: (query: string) => void;
}

/** Dishes to search for, so Discover is never a dead end: before a search, or after one found nothing. */
export default function DiscoverySuggestions({ onPick }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Try:</span>
      {DISCOVERY_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onPick(suggestion)}
          className="min-h-11 rounded-full border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
