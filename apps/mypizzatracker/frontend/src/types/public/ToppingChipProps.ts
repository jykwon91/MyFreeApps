import type { PublicTopping } from "./public";

export interface ToppingChipProps {
  topping: PublicTopping;
  selected: boolean;
  onClick: () => void;
}
