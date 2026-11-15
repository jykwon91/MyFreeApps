import { Gem, Shield, Users, UtensilsCrossed } from "lucide-react";
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
    id: "food",
    icon: UtensilsCrossed,
    title: "Well Fed",
    text: "No food buff, or one about to run out. Quiet while you eat.",
  },
  {
    id: "group",
    icon: Users,
    title: "Group buffs",
    text: "Fortitude, Arcane Intellect and Mark of the Wild, only when a Priest, Mage or Druid is in your group, naming who to ask.",
  },
];
