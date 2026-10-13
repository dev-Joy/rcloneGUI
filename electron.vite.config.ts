import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

// "@/"는 어느 프로세스에서나 src를 가리킨다 (AGENTS.md 개발 규칙).
const alias = { "@": resolve(__dirname, "src") };

export default defineConfig({
    main: { resolve: { alias } },
    preload: { resolve: { alias } },
    renderer: {
        resolve: { alias },
        plugins: [react()],
    },
});
