import type { ReactNode, Ref } from "react";
import type { KeyboardAwareScrollRef } from "@platform/mobile";

export interface ResumeScrollProps {
  children: ReactNode;
  testID: string;
  ref?: Ref<KeyboardAwareScrollRef>;
}
