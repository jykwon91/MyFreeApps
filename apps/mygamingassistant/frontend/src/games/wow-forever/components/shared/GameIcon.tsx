import { useState } from "react";
import clsx from "clsx";
import { QUALITY_BORDER_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { iconUrl } from "@/games/wow-forever/lib/icons/wowIcons";
import type { GameIconSize } from "@/games/wow-forever/types/icons/gameIconSize";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

interface GameIconProps {
  /** Null when the item / spell has no icon in the map — the placeholder shows. */
  icon: WowIcon | null;
  size: GameIconSize;
  /** The name, or "" when the name is printed next to it (the icon is then decorative). */
  alt: string;
  className?: string;
}

/**
 * An in-game icon in a small rounded frame, ringed in the item's quality colour.
 * A missing icon, or one that fails to load, keeps the same box as a neutral
 * placeholder, so rows never shift.
 */
export default function GameIcon({ icon, size, alt, className }: GameIconProps) {
  const src = icon ? iconUrl(icon.fileDataId) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frame = clsx(
    "inline-block shrink-0 overflow-hidden rounded border bg-muted align-middle",
    icon?.quality ? QUALITY_BORDER_CLASSES[icon.quality] : "border-border",
    className,
  );
  const box = { width: size, height: size };
  if (!src || failedSrc === src) {
    return (
      <span
        className={frame}
        style={box}
        data-testid="game-icon-placeholder"
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      />
    );
  }
  return (
    <span className={frame} style={box}>
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        aria-hidden={alt ? undefined : true}
        onError={() => setFailedSrc(src)}
        className="block h-full w-full"
        data-testid="game-icon"
      />
    </span>
  );
}
