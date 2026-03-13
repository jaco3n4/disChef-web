import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dischef.fr',
  output: 'static',
  build: {
    assets: '_assets',
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
