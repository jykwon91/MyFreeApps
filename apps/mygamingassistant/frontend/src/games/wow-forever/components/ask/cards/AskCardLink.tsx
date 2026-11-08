import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface AskCardLinkProps {
  to: string;
  children: ReactNode;
}

/** A card's link to the full page — offered, never followed for you. */
export default function AskCardLink({ to, children }: AskCardLinkProps) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
