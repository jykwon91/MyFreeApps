import type { StyleProp, TextStyle } from "react-native";

export interface BoldTextProps {
  /** With **bold** runs. */
  text: string;
  style?: StyleProp<TextStyle>;
}
