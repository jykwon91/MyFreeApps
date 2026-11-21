import { type ComponentRef, type RefCallback, useRef } from "react";
import type { TextInput } from "react-native";
import type { FieldChain } from "../types/FieldChain";
import type { FieldChainOptions } from "../types/FieldChainOptions";
import { usePendingPress } from "./usePendingPress";

type Input = ComponentRef<typeof TextInput>;

const NOTHING = (): void => undefined;

/**
 * Links a form's text fields so the keyboard's Return key moves to the next one, as Tab does on the website.
 * `order` lists the fields top to bottom; leave out (or pass `false` for) a field that isn't showing.
 * Return on the last field calls `onLast` once at a time, or just closes the keyboard without it.
 */
export function useFieldChain<K extends string>(
  order: readonly (K | false | null | undefined)[],
  { onLast, isLastBlocked = false, lastReturnKey = "go" }: FieldChainOptions = {},
): FieldChain<K> {
  const inputs = useRef(new Map<K, Input>());
  // One callback per field, so React doesn't detach and reattach every field on each render.
  const refs = useRef(new Map<K, RefCallback<Input>>());
  const submit = usePendingPress(onLast ?? NOTHING, isLastBlocked);
  const keys = order.filter((key): key is K => typeof key === "string");

  function refFor(key: K): RefCallback<Input> {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (input) => {
        if (input) inputs.current.set(key, input);
        else inputs.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }

  function focusAfter(key: K): void {
    for (const next of keys.slice(keys.indexOf(key) + 1)) {
      const input = inputs.current.get(next);
      if (input) {
        input.focus();
        return;
      }
    }
  }

  return {
    field: (key) => {
      const index = keys.indexOf(key);
      // A field left out of `order` isn't the last one, so its Return only closes the keyboard.
      if (index === -1) return { ref: refFor(key), returnKeyType: "done", submitBehavior: "blurAndSubmit", onSubmitEditing: undefined };
      if (index < keys.length - 1) {
        return { ref: refFor(key), returnKeyType: "next", submitBehavior: "submit", onSubmitEditing: () => focusAfter(key) };
      }
      return onLast
        ? { ref: refFor(key), returnKeyType: lastReturnKey, submitBehavior: "blurAndSubmit", onSubmitEditing: submit.press }
        : { ref: refFor(key), returnKeyType: "done", submitBehavior: "blurAndSubmit", onSubmitEditing: undefined };
    },
    target: (key) => ({ ref: refFor(key) }),
    focus: (key) => inputs.current.get(key)?.focus(),
  };
}
