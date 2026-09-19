import type { OxlintConfig } from "vite-plus/lint";
import solidV2 from "eslint-plugin-solid/configs/v2";

export default {
  jsPlugins: ["eslint-plugin-solid"],
  ignorePatterns: ["**/*.gen.*", "dist"],
  settings: solidV2.settings,
  rules: solidV2.rules,
} satisfies OxlintConfig;
