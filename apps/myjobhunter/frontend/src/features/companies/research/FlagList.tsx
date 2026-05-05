import { AlertTriangle, CheckCircle } from "lucide-react";

interface FlagListProps {
  title: string;
  flags: string[];
  icon: "green" | "red";
}

export default function FlagList({ title, flags, icon }: FlagListProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      <ul className="space-y-1">
        {flags.map((flag, i) => (
          <li key={i} className="flex items-start gap-1.5 text-sm">
            {icon === "green" ? (
              <CheckCircle size={13} className="text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={13} className="text-destructive shrink-0 mt-0.5" />
            )}
            <span>{flag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
