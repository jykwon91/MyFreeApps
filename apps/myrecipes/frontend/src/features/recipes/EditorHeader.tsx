import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface EditorHeaderProps {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string;
}

/**
 * Shared header for the recipe create / tweak / import editor pages: a back
 * link, the page title, and an optional subtitle.
 */
export default function EditorHeader({ backTo, backLabel, title, subtitle }: EditorHeaderProps) {
  return (
    <div className="space-y-2">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
