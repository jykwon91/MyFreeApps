import { CLASSIFICATION_CHOICES } from "@mybookkeeper/api-client/constants/propertyClassificationChoices";
import type { TileOption } from "@/shared/components/ui/TilePicker";

export const CLASSIFICATION_OPTIONS: TileOption[] = CLASSIFICATION_CHOICES.map((choice) => ({ ...choice }));
