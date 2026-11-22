import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ fallback: '404.html' })
    })
  ],
  // The worker uses a dynamic import so the AI runtime is fetched only for AI removal.
  worker: {
    format: 'es'
  }
});
