import {
  Activity,
  Backpack,
  Castle,
  Coins,
  Crosshair,
  Gauge,
  GitCompare,
  Hammer,
  LayoutDashboard,
  Lightbulb,
  Map as MapIcon,
  Scale,
  Sparkles,
  Terminal,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Lucide icons for the WoW Forever pages, keyed by `GameFeature.iconName` (left nav + hub tiles). */
export const FEATURE_ICONS: Readonly<Record<string, LucideIcon>> = {
  Activity,
  Backpack,
  Castle,
  Coins,
  Crosshair,
  Gauge,
  GitCompare,
  Hammer,
  LayoutDashboard,
  Lightbulb,
  Map: MapIcon,
  Scale,
  Sparkles,
  Terminal,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
};

/** Shown for an `iconName` missing from `FEATURE_ICONS`, and for the hub ("Overview"). */
export const FALLBACK_FEATURE_ICON: LucideIcon = LayoutDashboard;
