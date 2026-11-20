import { Building2 } from "lucide-react";

interface Props {
  logoUrl: string | null;
  name: string;
}

export default function CompanyLogo({ logoUrl, name }: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="w-8 h-8 rounded-md object-contain bg-muted shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase();
  if (initial) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-muted text-sm font-medium shrink-0"
      >
        {initial}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0"
    >
      <Building2 size={16} />
    </span>
  );
}
