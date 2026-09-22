import type { ChecklistItem } from "@/games/wow-forever/data/guide/guideTypes";

/**
 * "Avoid these" checklist. Ids are persisted in localStorage — never rename one.
 * Advice is general Classic-style play, not Forever-specific numbers.
 */
export const BEGINNER_MISTAKES: readonly ChecklistItem[] = [
  { id: "train-spells", title: "Visit your class trainer often", detail: "New spells and ranks unlock every couple of levels — skipping training makes fights much harder." },
  { id: "first-aid", title: "Learn First Aid", detail: "Bandages are free healing from cloth you already loot, and they work for every class." },
  { id: "one-pull", title: "Pull one enemy at a time", detail: "Watch for patrols and nearby mobs; fighting three at once is the most common way to die." },
  { id: "red-quests", title: "Skip quests that are far above your level", detail: "Red and orange quests hit much harder. Level up a bit and come back." },
  { id: "hearthstone", title: "Set your hearthstone at an inn near where you quest", detail: "It saves a long run back after you turn in quests or restock." },
  { id: "bags", title: "Upgrade your bags early", detail: "Bigger bags mean fewer trips to vendors — they're one of the best early purchases." },
  { id: "vendor-greys", title: "Sell grey items to a vendor", detail: "Grey (poor) items are vendor trash; don't list them on the auction house." },
  { id: "gathering", title: "Pick up a gathering profession", detail: "Mining, Herbalism or Skinning earns steady gold while you level." },
  { id: "save-mount", title: "Save gold for your first mount", detail: "Your first mount is the biggest early expense. Don't spend everything on the auction house." },
  { id: "repair", title: "Repair before dungeons", detail: "Broken gear gives no stats. Repair at an armor or weapon vendor before a group run." },
];
