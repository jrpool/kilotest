import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import {defineConfig} from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "docs/IDEAS.md",
      "package-lock.json",
      "coverage/**"
    ]
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      js
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      "no-control-regex": "off",
      "rest-spread-spacing": ["error", "never"],
      "space-unary-ops": [
        "error",
        {
          "words": true,
          "nonwords": false
        }
      ]
    }
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs"
    }
  },
  {
    files: ["**/*.json"],
    plugins: {
      json
    },
    language: "json/json",
    extends: ["json/recommended"]
  },
  {
    files: ["**/*.md"],
    plugins: {
      markdown
    },
    language: "markdown/gfm",
    extends: ["markdown/recommended"]
  },
  {
    files: ["**/*.css"],
    plugins: {
      css
    },
    language: "css/css",
    extends: ["css/recommended"]
  }
]);
