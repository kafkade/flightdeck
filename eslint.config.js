const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
        importScripts: "readonly",
        FlightDeckStorage: "readonly",
        FlightDeckRules: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error"
    }
  },
  {
    files: ["tests/**/*.js", "jest.config.js", "playwright.config.js", "eslint.config.js", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-redeclare": "off"
    }
  },
  {
    ignores: ["node_modules/", "dist/", "test-results/", "package-lock.json"]
  }
];
