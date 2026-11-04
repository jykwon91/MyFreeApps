const { transformIgnorePatterns } = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  // The preset turns this on, which would pass a project whose tests all went missing.
  passWithNoTests: false,
  // The first test in each file also pays for loading React Native, which is slow on CI.
  testTimeout: 30000,
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}"],
  // axios publishes ES modules to React Native's export condition, which is the one Jest resolves.
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.replace("/node_modules/(?!", "/node_modules/(?!axios/|"),
  ),
};
