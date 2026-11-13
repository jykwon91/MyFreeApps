const { transformIgnorePatterns } = require("jest-expo/jest-preset");

// These publish ES modules to React Native's export condition, which is the one Jest
// resolves here, so they need transforming like the packages the preset already allows.
const ES_MODULE_PACKAGES = "(?:react-redux|@reduxjs/toolkit|immer|reselect|redux|redux-thunk|axios)";

module.exports = {
  preset: "jest-expo",
  resolver: "<rootDir>/../../../packages/shared-mobile/jest/resolver.js",
  setupFiles: [
    "<rootDir>/../../../packages/shared-mobile/jest/animationFrame.js",
    "<rootDir>/../../../packages/shared-mobile/jest/reanimated.js",
    "<rootDir>/../../../packages/shared-mobile/jest/keyboardController.js",
  ],
  setupFilesAfterEnv: [
    "<rootDir>/../../../packages/shared-mobile/test-support/flushTimersAfterEach.ts",
    "<rootDir>/../../../packages/shared-mobile/test-support/resetStoresAfterAll.ts",
    "<rootDir>/../../../packages/shared-mobile/test-support/resetMockKeyboardBeforeEach.ts",
  ],
  // The preset turns this on, which would pass a project whose tests all went missing.
  passWithNoTests: false,
  // The first test in each file also pays for loading React Native, which is slow on CI.
  testTimeout: 30000,
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.replace("/node_modules/(?!", `/node_modules/(?!${ES_MODULE_PACKAGES}/|`),
  ),
};
