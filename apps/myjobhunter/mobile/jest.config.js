const { transformIgnorePatterns } = require("jest-expo/jest-preset");

// These publish ES modules to React Native's export condition, which is the one Jest
// resolves here, so they need transforming like the packages the preset already allows.
const ES_MODULE_PACKAGES = "(?:react-redux|@reduxjs/toolkit|immer|reselect|redux|redux-thunk|axios|parse5|entities)";

module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/../../../packages/shared-mobile/jest/animationFrame.js"],
  setupFilesAfterEnv: ["<rootDir>/../../../packages/shared-mobile/test-support/flushTimersAfterEach.ts"],
  // The preset turns this on, which would pass a project whose tests all went missing.
  passWithNoTests: false,
  // The first test in each file also pays for loading React Native, which is slow on CI.
  testTimeout: 30000,
  // Node still ships a deprecated core "punycode", which Jest would pick over the npm package the
  // phone bundles; the trailing slash resolves the package.
  moduleNameMapper: { "^punycode$": require.resolve("punycode/") },
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.replace("/node_modules/(?!", `/node_modules/(?!${ES_MODULE_PACKAGES}/|`),
  ),
};
