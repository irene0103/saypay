<script setup lang="ts">
/**
 * The dialog shell for the 分帳 screens.
 *
 * design-system.md §3.4: dialogs are one of the three elements allowed a shadow
 * (--shadow-pop), because they genuinely float above the content. Everything else on the
 * page separates with a hairline.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { X } from '@lucide/vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(56,56,48,0.28)] sm:items-center sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-[440px] rounded-t-lg bg-surface p-4 shadow-pop sm:rounded-lg"
        role="dialog"
        aria-modal="true"
      >
        <header class="mb-4 flex items-center justify-between">
          <h2 class="text-text" :style="{ font: 'var(--font-h2)' }">{{ title }}</h2>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
            aria-label="關閉"
            @click="emit('close')"
          >
            <X :size="20" />
          </button>
        </header>

        <slot />

        <footer v-if="$slots.footer" class="mt-5 flex gap-2">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
