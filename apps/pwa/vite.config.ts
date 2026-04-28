import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          minSize: 1,
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              priority: 40,
            },
            {
              name: "vendor-r3f",
              test: /node_modules[\\/]@react-three[\\/]fiber[\\/]/,
              priority: 35,
            },
            {
              name: "vendor-three",
              test: /node_modules[\\/]three[\\/]/,
              priority: 30,
              maxSize: 240 * 1024,
            },
            {
              name: "vendor-ui",
              test: /node_modules[\\/](gsap|lucide-react|zustand|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
