import { Gem, HandHeart, Heart, Shield, Users, UtensilsCrossed } from "lucide-react";
import type { BuffsAddonCheck } from "@/games/wow-forever/types/buffsAddon/buffsAddonCheck";

/** What MGA Buffs reminds you about, in the order its list shows them. Each one is `/mgabuffs <id>` to turn off. */
export const BUFFS_ADDON_CHECKS: readonly BuffsAddonCheck[] = [
  {
    id: "armor",
    icon: Shield,
    title: "Your armor",
    text: "Demon Skin or Demon Armor for Warlocks, Frost, Ice or Mage Armor for Mages, Inner Fire for Priests.",
  },
  {
    id: "soulstone",
    icon: Gem,
    title: "Soulstone",
    text: "Warlocks from level 18: your Soulstone on someone running out, a stone in your bags that's ready but on no one, or no stone at all.",
  },
  {
    id: "healthstone",
    icon: Heart,
    title: "Healthstone",
    text: "None in your bags: Warlocks are told to make one, everyone else to ask the Warlock in the group by name.",
  },
  {
    id: "food",
    icon: UtensilsCrossed,
    title: "Well Fed",
    text: "No food buff, or one about to run out. Quiet while you eat.",
  },
  {
    id: "group",
    icon: Users,
    title: "Group buffs on you",
    text: "Fortitude, Arcane Intellect, Mark of the Wild and a Paladin Blessing, only when a Priest, Mage, Druid or Paladin is in your group, naming who to ask.",
  },
  {
    id: "party",
    icon: HandHeart,
    title: "Buff your party",
    text: "When you can cast one of those (or Divine Spirit), who in your party is missing it. Anyone out of range is counted, not named.",
  },
];
