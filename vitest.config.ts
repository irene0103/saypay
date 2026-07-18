import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

// vite.config now exports a config FUNCTION (so it can pick the GitHub Pages base only on
// build). mergeConfig needs a plain object, so resolve it under a serve-like context —
// tests don't care about `base`.
const resolvedViteConfig = viteConfig({ command: 'serve', mode: 'test' })

export default mergeConfig(
  resolvedViteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
