/* global jest */
// Reanimated and its worklets runtime need native modules that don't exist under Jest, so every test gets their
// official mocks: an Animated.View is a View, and useAnimatedStyle returns its style computed once from the shared
// values it reads, so a test sets a shared value and reads the style on the next render. The official
// useSharedValue makes a fresh value every render; a real one lasts the component's life, so this one does too.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual("react-native-reanimated/mock");
  const { useState } = jest.requireActual("react");
  const { sharedValueOf } = jest.requireActual("../test-support/sharedValueOf");
  return { ...mock, useSharedValue: (initial) => useState(() => sharedValueOf(initial))[0] };
});
