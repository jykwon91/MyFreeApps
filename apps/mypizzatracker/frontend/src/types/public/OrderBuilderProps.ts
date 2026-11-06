import type { PublicDrop, PublicMenu, PublicOrderConfirmation } from "@/types/public/public";

export interface OrderBuilderProps {
  drop: PublicDrop;
  menu: PublicMenu;
  onPlaced: (confirmation: PublicOrderConfirmation) => void;
}
