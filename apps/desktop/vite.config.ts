import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: '../../assets/public',
  plugins: [react()],
  clearScreen: false,
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
