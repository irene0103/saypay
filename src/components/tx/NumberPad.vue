<script setup lang="ts">
/**
 * In-app numeric keypad — reference layout 圖3.
 *
 * The amount is entered through this pad, not a native keyboard. That's what the reference
 * design shows, and it also sidesteps iOS's focus-zoom entirely: the amount is a display
 * element, never a focused <input>. Value is a decimal 元 string (e.g. "120", "12.5");
 * the parent converts to cents.
 */
const model = defineModel<string>({ required: true })

function press(key: string) {
  const cur = model.value

  if (key === 'del') {
    model.value = cur.slice(0, -1)
    return
  }
  if (key === '.') {
    if (cur.includes('.')) return
    model.value = cur === '' ? '0.' : cur + '.'
    return
  }
  // Digit. Block a leading zero (so "05" can't happen) and cap at 2 decimal places.
  if (cur === '0') {
    model.value = key
    return
  }
  const dot = cur.indexOf('.')
  if (dot >= 0 && cur.length - dot > 2) return
  model.value = cur + key
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
</script>

<template>
  <div class="grid grid-cols-3 gap-px bg-border" :style="{ font: 'var(--font-h1)' }">
    <button
      v-for="k in KEYS"
      :key="k"
      class="flex h-14 items-center justify-center bg-surface-alt text-text active:bg-sage-100"
      :aria-label="k === 'del' ? '刪除' : k"
      @click="press(k)"
    >
      <svg
        v-if="k === 'del'"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
        <path d="m18 9-6 6M12 9l6 6" />
      </svg>
      <span v-else class="money">{{ k }}</span>
    </button>
  </div>
</template>
