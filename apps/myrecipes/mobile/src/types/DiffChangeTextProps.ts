import type { TextStyle } from "react-native";
import type { DiffLine } from "./DiffLine";

export interface DiffChangeTextProps {
  line: DiffLine;
  text: TextStyle;
  struck: TextStyle;
}
