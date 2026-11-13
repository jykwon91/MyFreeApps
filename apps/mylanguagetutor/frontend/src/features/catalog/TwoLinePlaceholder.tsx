import { cn, Skeleton } from "@platform/ui";
import { TWO_TEXT_LINES } from "@/constants/catalogLayout";

interface TwoLinePlaceholderProps {
  /** Width classes for the first bar; the second is half width. */
  firstWidth: string;
  className?: string;
}

/** A text-sm line the page holds two lines tall (TWO_TEXT_LINES): a bar per line. */
export default function TwoLinePlaceholder({ firstWidth, className }: TwoLinePlaceholderProps) {
  return (
    <div className={cn(TWO_TEXT_LINES, className)}>
      <Skeleton className={cn("h-5", firstWidth)} />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}
