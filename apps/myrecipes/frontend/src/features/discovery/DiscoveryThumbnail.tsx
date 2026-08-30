import { useState } from "react";
import { ChefHat } from "lucide-react";
import { cn } from "@platform/ui";
import { apiUrl } from "@/lib/apiBase";

interface Props {
  /** API-relative proxy path from the backend, or null when there is none. */
  path: string | null;
  alt: string;
  className?: string;
}

/**
 * A discovered recipe's picture, or a placeholder tile.
 *
 * Two things make the fallback load-bearing rather than decorative. The
 * pictures live on other people's servers, so a share of them will be gone,
 * hotlink-blocked, or not actually images — the proxy answers 404 and the
 * browser fires `onError`. And the model is told to return null rather than
 * guess, so "no picture" is a normal, frequent result. Either way the card
 * keeps its shape and the grid stays aligned.
 */
export default function DiscoveryThumbnail({ path, alt, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!path || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground/50",
          className,
        )}
        aria-hidden="true"
      >
        <ChefHat className="h-8 w-8" />
      </div>
    );
  }

  return (
    <img
      src={apiUrl(path)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover bg-muted", className)}
    />
  );
}
