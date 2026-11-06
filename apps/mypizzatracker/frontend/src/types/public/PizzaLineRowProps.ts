import type { PublicMenu } from "./public";
import type { PizzaLineDraft } from "./PizzaLineDraft";

export interface PizzaLineRowProps {
  index: number;
  line: PizzaLineDraft;
  menu: PublicMenu;
  canRemove: boolean;
  onChange: (next: PizzaLineDraft) => void;
  onRemove: () => void;
}
