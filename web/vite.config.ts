import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  build: {
    target: 'esnext',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/epubs': 'http://localhost:8080',
    },
  },
});
