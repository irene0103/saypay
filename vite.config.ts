import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import UnoCSS from 'unocss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), UnoCSS()],
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
})
