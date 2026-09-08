/**
 * ScreenshotHalf — one still-image pane.
 *
 * Split out of LineupPanes.tsx so each file holds a single component.
 *
 * Used for STAND and AIM panes (the two stand-in jobs). Renders the image
 * when url is non-null, otherwise a "No screenshot" empty state. Corner
 * label overlays in top-left. ``imgStyle`` lets the caller apply CSS to the
 * <img> (used by AimPane to zoom into the persisted anchor — overflow-hidden
 * on the wrapper crops the zoomed content to pane bounds).
 */
import { CornerLabel } from "./CornerLabel";

export interface ScreenshotHalfProps {
  url: string | null;
  alt: string;
  label: string;
  imgStyle?: React.CSSProperties;
}

export function ScreenshotHalf({ url, alt, label, imgStyle }: ScreenshotHalfProps) {
  return (
    <div className="flex-1 min-w-0 relative bg-muted/20 aspect-video overflow-hidden">
      {url ? (
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          style={imgStyle}
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          No screenshot
        </div>
      )}
      <CornerLabel>{label}</CornerLabel>
    </div>
  );
}
