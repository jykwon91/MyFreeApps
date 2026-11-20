import { ArrowRight } from "lucide-react";
import type { DiffChangeKind } from "@myrecipes/api-client/types/recipe/diff";

interface Props {
  change: DiffChangeKind;
  before: string | null;
  after: string | null;
}

/** A diff line's text: before -> after for a change, the old text struck through for a removal, else the new text. */
export default function DiffRowText({ change, before, after }: Props) {
  if (change === "changed") {
    return (
      <span className="flex flex-1 flex-wrap items-center gap-2">
        <span className="text-muted-foreground line-through">{before}</span>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
        <span className="font-medium">{after}</span>
      </span>
    );
  }
  if (change === "removed") {
    return <span className="flex-1 text-muted-foreground line-through">{before}</span>;
  }
  return <span className="flex-1 font-medium">{after}</span>;
}
