import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", ".specify", ".claude"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error", "warn", "info"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/contracts/**/*.ts"],
    rules: { "no-restricted-globals": ["error", "Date", "Math"] },
  },
  {
    // Vercel compiles api/ without tsconfig path mappings (001 research R2), so
    // everything reachable from a function imports with relative paths.
    files: ["api/**/*.ts", "src/server/**/*.ts", "src/domain/**/*.ts", "src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@domain/*", "@contracts/*", "@server/*", "@client/*"], message: "Use a relative import: Vercel does not resolve path aliases." }] },
      ],
    },
  },
);
