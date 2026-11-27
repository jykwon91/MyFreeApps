/* global jest */
// react-native-webview looks up its native module as soon as it's imported, which doesn't exist under Jest, so a
// test of anything that reaches the captcha screens gets test-support/mockWebView: a View with every prop, found
// by the test ID "webview". Only for @platform/mobile and apps that import @platform/mobile/captcha (and so list
// react-native-webview): it's an optional peer, absent from the others.
jest.mock("react-native-webview", () => jest.requireActual("../test-support/mockWebView"));
