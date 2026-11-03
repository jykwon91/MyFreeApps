module.exports = {
  preset: "jest-expo",
  // The preset turns this on, which would pass a project whose tests all went missing.
  passWithNoTests: false,
  // The first test in each file also pays for loading React Native, which is slow on CI.
  testTimeout: 30000,
  testMatch: ["<rootDir>/__tests__/**/*.test.{ts,tsx}"],
};
