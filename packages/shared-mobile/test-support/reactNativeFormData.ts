/** Jest runs on Node, whose FormData turns a phone's { uri, name, type } file into a string. */
globalThis.FormData = jest.requireActual<{ default: typeof globalThis.FormData }>(
  "react-native/Libraries/Network/FormData",
).default;
