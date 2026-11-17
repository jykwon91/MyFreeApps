/* global jest */
// KeyboardAwareScroll reads the safe area's insets, so a test that renders one needs them without mounting a provider.
// The library's own mock reports none; a test that wants some mocks the module itself, which wins over this.
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
