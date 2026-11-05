import type { TileOption } from "@/shared/components/ui/TilePicker";

export const CLASSIFICATION_OPTIONS: TileOption[] = [
  { value: "investment", label: "Investment Property", description: "Rental property — expenses deducted on Schedule E" },
  { value: "primary_residence", label: "Primary Residence", description: "Your main home — mortgage interest and taxes on Schedule A" },
  { value: "second_home", label: "Second Home", description: "Vacation home — mortgage interest and taxes on Schedule A" },
  { value: "unclassified", label: "Not Sure Yet", description: "I'll classify this later" },
];
