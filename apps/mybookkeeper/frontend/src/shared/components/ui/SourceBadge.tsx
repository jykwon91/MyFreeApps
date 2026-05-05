import { Mail, Plane, Home, Link2, User, MoreHorizontal } from "lucide-react";
import type { Source } from "@/shared/types/source";
import type { BadgeColor } from "./Badge";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

/**
 * Single source-of-truth table for source label / color / icon. Listings and
 * Inquiries both render through SourceBadge — duplicating the data per
 * domain (the original PR 1.1b approach) leaves them free to drift, which
 * already happened (the inquiries domain has ``"other"`` while listings have
 * ``"Airbnb"``).
 */
interface SourceMeta {
  fullLabel: string;
  shortLabel: string;
  color: BadgeColor;
  Icon: typeof Mail;
}

const SOURCE_META: Record<Source, SourceMeta> = {
  FF: {
    fullLabel: "Furnished Finder",
    shortLabel: "FF",
    color: "blue",
    Icon: Mail,
  },
  TNH: {
    fullLabel: "Travel Nurse Housing",
    shortLabel: "TNH",
    color: "purple",
    Icon: Plane,
  },
  Airbnb: {
    fullLabel: "Airbnb",
    shortLabel: "Airbnb",
    color: "red",
    Icon: Home,
  },
  direct: {
    fullLabel: "Direct",
    shortLabel: "Direct",
    color: "gray",
    Icon: User,
  },
  other: {
    fullLabel: "Other",
    shortLabel: "Other",
    color: "orange",
    Icon: MoreHorizontal,
  },
  // T0 — public inquiry form (https://.../apply/<slug>)
  public_form: {
    fullLabel: "Public form",
    shortLabel: "Form",
    color: "green",
    Icon: Link2,
  },
};

export interface SourceBadgeProps {
  source: Source;
  variant?: "full" | "short";
  className?: string;
}

/**
 * Color + icon badge for inquiry/listing sources. Used across listings,
 * inquiries, and applicants per RENTALS_PLAN.md §9.2.
 */
export default function SourceBadge({ source, variant = "full", className = "" }: SourceBadgeProps) {
  const meta = SOURCE_META[source];
  const label = variant === "short" ? meta.shortLabel : meta.fullLabel;
  const Icon = meta.Icon;
  return (
    <span
      data-testid={`source-badge-${source}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[meta.color]} ${className}`.trim()}
      aria-label={`Source: ${meta.fullLabel}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
