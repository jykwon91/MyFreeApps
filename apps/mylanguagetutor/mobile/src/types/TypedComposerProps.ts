import type { ComponentRef, Ref } from "react";
import type { TextInput } from "react-native";

export interface TypedComposerProps {
  label: string;
  placeholder: string;
  /** A turn is streaming: Send shows that and waits. */
  busy: boolean;
  onSend: (text: string) => void;
  /** The learner typed: keeps the screen awake. */
  onActivity: () => void;
  inputRef: Ref<ComponentRef<typeof TextInput>>;
}
