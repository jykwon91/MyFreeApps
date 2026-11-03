import type { spacing } from "../theme/spacing";
import type { radius } from "../theme/radius";
import type { fontSize } from "../theme/typography";
import type { ThemeColors } from "./ThemeColors";

export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
}
