import clsx from "clsx";
import { MapPin } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { LIBRARY_UNKNOWN } from "@/games/wow-forever/data/library/libraryConfig";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LibraryBook } from "@/games/wow-forever/types/library/libraryBook";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface LibraryBookRowProps {
  book: LibraryBook;
  found: boolean;
  onToggleFound: () => void;
}

/** One book: icon, name, its in-game description, item level, where it's found (not known yet) and the "Found" tick. */
export default function LibraryBookRow({ book, found, onToggleFound }: LibraryBookRowProps) {
  return (
    <li
      className={clsx("space-y-2 rounded-xl border bg-card p-3 sm:p-4", found && "opacity-70")}
      data-testid="library-book"
      data-book-id={book.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <GameIcon icon={itemIcon(book.id)} size={32} alt="" />
          <div className="min-w-0">
            <h3 className={clsx("font-medium break-words", QUALITY_TEXT_CLASSES[book.quality])}>{book.name}</h3>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Item level {book.itemLevel}
              <ProvenanceBadge provenance={PROVENANCE.client} />
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm min-h-[44px]">
          <input
            type="checkbox"
            checked={found}
            onChange={onToggleFound}
            className="h-5 w-5"
            aria-label={`Found: ${book.name}`}
          />
          <span aria-hidden>Found</span>
        </label>
      </div>
      <p className="text-sm italic text-muted-foreground">“{book.description}”</p>
      <p className="inline-flex items-center gap-1.5 text-sm" data-testid="library-book-where">
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        Where: {LIBRARY_UNKNOWN.where}
      </p>
    </li>
  );
}
