import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface WowPageHeaderProps {
  title: string;
  /** An icon before the title (an item page's). */
  icon?: ReactNode;
  subtitle: string;
  backTo: string;
  backLabel: string;
}

export default function WowPageHeader({ title, icon, subtitle, backTo, backLabel }: WowPageHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <Link
        to={backTo}
        className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={backLabel}
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="space-y-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {icon}
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </header>
  );
}
