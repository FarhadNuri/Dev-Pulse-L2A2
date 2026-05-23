import { defineConfig } from "tsup";

export default defineConfig({
 entry: ["src/server.ts"],
 format: ["cjs"],
 target: "node18",
 outDir: "dist",
 clean: true,
 bundle: true,
 splitting: false,
 sourcemap: true,
 external: ["pg-native", "bcrypt"],
 noExternal: [/^(?!pg-native|bcrypt).*/],
});





