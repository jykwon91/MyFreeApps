import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type {
  DiscoveryDifficulty,
  DiscoverySourceType,
} from "@/types/recipe/discovery";

/**
 * Display maps for the discovery enums. Exhaustive `Record`s on purpose: add a
 * source type to the backend `Literal` and TypeScript fails here until the
 * label and colour exist, rather than rendering a blank badge in production.
 */
export const SOURCE_LABELS: Record<DiscoverySourceType, string> = {
  website: "Recipe site",
  youtube: "YouTube",
  reddit: "Reddit",
  blog: "Blog",
  video: "Video",
  forum: "Forum",
};

export const SOURCE_COLORS: Record<DiscoverySourceType, BadgeColor> = {
  website: "blue",
  youtube: "red",
  reddit: "orange",
  blog: "purple",
  video: "red",
  forum: "gray",
};

export const DIFFICULTY_LABELS: Record<DiscoveryDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Involved",
};

/** "1 hr 30 min" — total time as a cook reads it, not as minutes. */
export function formatTotalMinutes(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/** "seriouseats.com" — the publisher when the model didn't name one. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
