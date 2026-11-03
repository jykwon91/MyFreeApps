import type { ButtonVariant } from "../types/ButtonVariant";
import type { ThemeColors } from "../types/ThemeColors";

export function buttonBackground(variant: ButtonVariant, colors: ThemeColors): string {
  switch (variant) {
    case "primary":
      return colors.primary;
    case "destructive":
      return colors.destructive;
    case "secondary":
    case "ghost":
      return "transparent";
  }
}

export function buttonForeground(variant: ButtonVariant, colors: ThemeColors): string {
  switch (variant) {
    case "primary":
      return colors.primaryForeground;
    case "destructive":
      return colors.destructiveForeground;
    case "secondary":
      return colors.foreground;
    case "ghost":
      return colors.mutedForeground;
  }
}
