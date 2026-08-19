// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions/** runs on Deno, not Node/React Native — a
    // different runtime and type system entirely (global `Deno`, `jsr:`
    // imports). Not part of this app's build; excluded from both lint
    // and tsc (see tsconfig.json) rather than fighting the RN project's
    // config to understand a different language target.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
