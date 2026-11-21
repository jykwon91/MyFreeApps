import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { useFieldChain } from "../hooks/useFieldChain";
import type { FieldChainOptions } from "../types/FieldChainOptions";
import { forgetFocusedFields, lastFocusedField } from "../../test-support/focusedField";

type Key = "first" | "middle" | "notes" | "last";

interface FormProps extends FieldChainOptions {
  showsMiddle?: boolean;
  showsNotes?: boolean;
}

function Form({ showsMiddle = true, showsNotes = false, ...options }: FormProps) {
  const chain = useFieldChain<Key>(["first", showsMiddle && "middle", showsNotes && "notes", "last"], options);
  return (
    <>
      <TextInput accessibilityLabel="First" {...chain.field("first")} />
      {showsMiddle ? <TextInput accessibilityLabel="Middle" {...chain.field("middle")} /> : null}
      {showsNotes ? <TextInput accessibilityLabel="Notes" multiline {...chain.target("notes")} /> : null}
      <TextInput accessibilityLabel="Last" {...chain.field("last")} />
      <TextInput accessibilityLabel="Outside" onFocus={() => chain.focus("middle")} />
    </>
  );
}

beforeEach(forgetFocusedFields);

test("Return on a field moves to the next one and keeps the keyboard up", async () => {
  await render(<Form />);
  const first = screen.getByLabelText("First");
  expect(first.props.returnKeyType).toBe("next");
  expect(first.props.submitBehavior).toBe("submit");

  await fireEvent(first, "submitEditing");
  expect(lastFocusedField()).toBe("Middle");
  await fireEvent(screen.getByLabelText("Middle"), "submitEditing");
  expect(lastFocusedField()).toBe("Last");
});

test("a field that isn't showing is skipped", async () => {
  await render(<Form showsMiddle={false} />);
  await fireEvent(screen.getByLabelText("First"), "submitEditing");
  expect(lastFocusedField()).toBe("Last");
});

test("a multiline field is moved into but its Return is left alone, for new lines", async () => {
  await render(<Form showsMiddle={false} showsNotes />);
  await fireEvent(screen.getByLabelText("First"), "submitEditing");
  expect(lastFocusedField()).toBe("Notes");
  const notes = screen.getByLabelText("Notes");
  expect(notes.props.returnKeyType).toBeUndefined();
  expect(notes.props.onSubmitEditing).toBeUndefined();
});

test("without a submit, Return on the last field just closes the keyboard", async () => {
  await render(<Form />);
  const last = screen.getByLabelText("Last");
  expect(last.props.returnKeyType).toBe("done");
  expect(last.props.submitBehavior).toBe("blurAndSubmit");
  expect(last.props.onSubmitEditing).toBeUndefined();
});

test("Return on the last field submits, once at a time", async () => {
  let settle = (): void => undefined;
  const onLast = jest.fn(() => new Promise<void>((resolve) => (settle = resolve)));
  await render(<Form onLast={onLast} />);
  const last = screen.getByLabelText("Last");
  expect(last.props.returnKeyType).toBe("go");

  await fireEvent(last, "submitEditing");
  await fireEvent(last, "submitEditing");
  expect(onLast).toHaveBeenCalledTimes(1);

  await act(async () => settle());
  await fireEvent(screen.getByLabelText("Last"), "submitEditing");
  expect(onLast).toHaveBeenCalledTimes(2);
});

test("Return on the last field does nothing while submitting is blocked", async () => {
  const onLast = jest.fn();
  await render(<Form isLastBlocked lastReturnKey="send" onLast={onLast} />);
  const last = screen.getByLabelText("Last");
  expect(last.props.returnKeyType).toBe("send");
  await fireEvent(last, "submitEditing");
  expect(onLast).not.toHaveBeenCalled();
});

test("focus puts the cursor in a named field", async () => {
  await render(<Form />);
  await fireEvent(screen.getByLabelText("Outside"), "focus");
  expect(lastFocusedField()).toBe("Middle");
});

function Stray({ onLast }: { onLast: () => void }) {
  const chain = useFieldChain<Key>(["first", "last"], { onLast });
  return <TextInput accessibilityLabel="Stray" {...chain.field("notes")} />;
}

test("a field left out of the order only closes the keyboard, and never submits", async () => {
  const onLast = jest.fn();
  await render(<Stray onLast={onLast} />);
  const stray = screen.getByLabelText("Stray");
  expect(stray.props.returnKeyType).toBe("done");
  expect(stray.props.onSubmitEditing).toBeUndefined();
  await fireEvent(stray, "submitEditing");
  expect(onLast).not.toHaveBeenCalled();
});
