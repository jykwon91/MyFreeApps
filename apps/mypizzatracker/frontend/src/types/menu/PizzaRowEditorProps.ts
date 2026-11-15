import type { PizzaType } from "./menu";

export interface PizzaRowEditorProps {
  pizza: PizzaType;
  onClose: () => void;
}
