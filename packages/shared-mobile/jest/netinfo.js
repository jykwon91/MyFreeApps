/* global jest */
// NetInfo reads a native module that doesn't exist under Jest, so every test gets the library's own mock.
jest.mock("@react-native-community/netinfo", () => jest.requireActual("@react-native-community/netinfo/jest/netinfo-mock.js"));
