import { Link } from "react-router-dom";

export interface ClassNavLinkProps {
  to: string;
  label: string;
  description: string;
}

/** A single navigation link tile used by ClassNavLinks. */
export default function ClassNavLink({ to, label, description }: ClassNavLinkProps) {
  return (
    <Link
      to={to}
      className="flex flex-col rounded-lg border bg-card px-4 py-2.5 hover:bg-muted/40 transition-colors min-h-[44px] justify-center"
      data-testid={`class-navlink-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="font-medium text-sm leading-tight">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}
