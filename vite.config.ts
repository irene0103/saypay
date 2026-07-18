import { fileURLToPath, URL } from 'node:url'
import { copyFileSync, existsSync } from 'node:fs'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import UnoCSS from 'unocss/vite'

/**
 * GitHub Pages serves this project site under a sub-path
 * (https://irene0103.github.io/saypay/), so production assets must be requested from
 * `/saypay/…`, not `/…`. Without this base the browser asks the domain root for
 * /assets/*.js and gets 404. Dev stays at `/`.
 */
const BASE = '/saypay/'

/**
 * SPA fallback for GitHub Pages. Pages has no server-side rewrite, so refreshing a client
 * route like /saypay/split would 404. Serving index.html's content as 404.html makes Pages
 * hand the app back for any unknown path, and the router then resolves it.
 */
function spaFallback(): Plugin {
  return {
    name: 'gh-pages-spa-fallback',
    closeBundle() {
      const index = fileURLToPath(new URL('./dist/index.html', import.meta.url))
      const notFound = fileURLToPath(new URL('./dist/404.html', import.meta.url))
      if (existsSync(index)) copyFileSync(index, notFound)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [vue(), vueDevTools(), UnoCSS(), spaFallback()],
  server: {
    // This machine's /etc/hosts has no `localhost` entry, so Vite's default host lookup
    // fails with ENOTFOUND. Binding the loopback IP directly sidesteps DNS.
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
