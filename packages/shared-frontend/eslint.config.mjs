import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "*.config.{js,mjs}"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The Discord test utils wrap and restore console.* on purpose.
    files: ["src/__tests__/**"],
    rules: { "no-console": "off" },
  },
  {
    // crashGuard.ts holds Playwright fixtures. They receive a callback
    // named `use` (`async ({}, use) => { ... await use(value) }`), which
    // react-hooks/rules-of-hooks mistakes for the React `use` hook. There are
    // no React components in this file, so the React-only rules don't apply.
    files: ["test-support/crashGuard.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-refresh/only-export-components": "off",
    },
  },
);
