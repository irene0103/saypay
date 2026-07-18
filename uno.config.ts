import { defineConfig, presetWind3 } from 'unocss'

/**
 * The design tokens live in src/styles/tokens.css as CSS variables (design-system.md §8).
 * UnoCSS only maps utility names onto those variables — it never re-declares a colour.
 * One source of truth: change the hex in tokens.css and every utility follows.
 */
export default defineConfig({
  presets: [presetWind3()],
  theme: {
    colors: {
      sage: {
        50: 'var(--sage-50)',
        100: 'var(--sage-100)',
        200: 'var(--sage-200)',
        300: 'var(--sage-300)',
        500: 'var(--sage-500)',
        700: 'var(--sage-700)',
        900: 'var(--sage-900)',
      },
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      'surface-alt': 'var(--surface-alt)',
      border: 'var(--border)',
      'border-strong': 'var(--border-strong)',
      text: 'var(--text)',
      'text-secondary': 'var(--text-secondary)',
      'text-tertiary': 'var(--text-tertiary)',
      receivable: 'var(--receivable)',
      payable: 'var(--payable)',
      'payable-soft': 'var(--payable-soft)',
      'over-budget': 'var(--over-budget)',
      warn: 'var(--warn)',
      'warn-soft': 'var(--warn-soft)',
      chart: {
        1: 'var(--chart-1)',
        2: 'var(--chart-2)',
        3: 'var(--chart-3)',
        4: 'var(--chart-4)',
        5: 'var(--chart-5)',
        6: 'var(--chart-6)',
      },
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      pill: 'var(--radius-pill)',
    },
    spacing: {
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      8: 'var(--space-8)',
    },
    boxShadow: {
      fab: 'var(--shadow-fab)',
      pop: 'var(--shadow-pop)',
    },
    fontFamily: {
      num: 'var(--font-num)',
      tc: 'var(--font-tc)',
      en: 'var(--font-en)',
    },
  },
  shortcuts: {
    // The base card: surface fill, hairline border, no shadow (design-system.md §5.1).
    card: 'bg-surface border border-border rounded-lg p-4',
    // The one card in the app allowed a solid fill — it is the visual anchor (§5.2).
    'card-hero': 'bg-sage-100 border-none rounded-lg p-4',
    'btn-base':
      'h-11 px-4 rounded-md inline-flex items-center justify-center gap-2 font-tc text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
    'btn-primary': 'btn-base bg-sage-500 text-white hover:bg-sage-700 disabled:bg-sage-300',
    'btn-secondary': 'btn-base bg-surface text-sage-700 border border-sage-300 hover:bg-sage-50',
    'btn-ghost': 'btn-base bg-transparent text-text-secondary hover:bg-surface-alt',
    'btn-danger': 'btn-base bg-transparent text-payable border border-payable',
    input:
      'h-11 px-3 rounded-md bg-surface-alt border border-border-strong text-text placeholder:text-text-tertiary focus:(border-sage-500 outline-none ring-2 ring-sage-100)',
    // Money must never jitter as digits change (design-system.md §2.1).
    money: 'font-num tabular-nums',
  },
  safelist: ['text-chart-1', 'text-chart-2', 'text-chart-3', 'text-chart-4', 'text-chart-5', 'text-chart-6'],
})
