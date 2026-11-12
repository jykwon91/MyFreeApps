/* global jest */
// react-native-keyboard-controller has native views and modules that don't exist under Jest, so every test gets
// the library's own mock: KeyboardAwareScrollView renders as a ScrollView and KeyboardAvoidingView as a View, each
// passing its props through, and useKeyboardState is a jest.fn a test can override. The keyboard's position comes
// from test-support/mockKeyboard, closed unless a test opens it, and useKeyboardHandler registers its handler
// there so a test can move the keyboard with moveMockKeyboard.
jest.mock("react-native-keyboard-controller", () => {
  const mock = jest.requireActual("react-native-keyboard-controller/jest");
  const { useEffect } = jest.requireActual("react");
  const { mockKeyboard } = jest.requireActual("../test-support/mockKeyboard");
  const reanimated = () => ({ height: mockKeyboard.height, progress: mockKeyboard.progress });
  return {
    ...mock,
    useKeyboardContext: jest.fn(() => ({ ...mock.useKeyboardContext(), reanimated: reanimated() })),
    useReanimatedKeyboardAnimation: jest.fn(reanimated),
    // Registered while the component is mounted, with the handler from its latest render, as the library does.
    useKeyboardHandler: jest.fn((handler) => {
      useEffect(() => {
        mockKeyboard.handlers.add(handler);
        return () => mockKeyboard.handlers.delete(handler);
      });
    }),
  };
});
