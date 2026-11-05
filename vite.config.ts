import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // The worker uses a dynamic import so the AI runtime is fetched only for AI removal.
  worker: {
    format: 'es'
  }
});
