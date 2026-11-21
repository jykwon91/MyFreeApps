import { Building2 } from "lucide-react";

interface CompanyAvatarProps {
  logoUrl: string | null;
  name: string;
}

/** Small logo with an initial fallback. */
export default function CompanyAvatar({ logoUrl, name }: CompanyAvatarProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="w-5 h-5 rounded-sm object-contain shrink-0 bg-muted"
        // If the logo URL fails, fall back to nothing — the name still renders.
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-muted text-xs font-medium shrink-0"
    >
      {initial || <Building2 size={12} />}
    </span>
  );
}
