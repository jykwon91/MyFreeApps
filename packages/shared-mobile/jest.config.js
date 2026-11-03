module.exports = {
  preset: "jest-expo",
  // The preset turns this on, which would pass a project whose tests all went missing.
  passWithNoTests: false,
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}"],
};
