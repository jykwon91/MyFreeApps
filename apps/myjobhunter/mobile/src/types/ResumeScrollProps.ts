import type { ReactNode, Ref } from "react";
import type { ScrollViewInstance } from "react-native";

export interface ResumeScrollProps {
  children: ReactNode;
  testID: string;
  ref?: Ref<ScrollViewInstance>;
}
