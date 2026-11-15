import type { ToppingType } from "./menu";

export interface ToppingRowEditorProps {
  topping: ToppingType;
  onClose: () => void;
}
