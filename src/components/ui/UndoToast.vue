<script setup lang="ts">
/**
 * Bottom toast — design-system.md §6 (slide in from the bottom, 200ms) and §3.4
 * (allowed a shadow, since it floats above content).
 */
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<template>
  <Transition name="toast">
    <div
      v-if="toast.current"
      class="fixed inset-x-4 bottom-20 z-60 mx-auto flex max-w-[440px] items-center justify-between gap-3 rounded-md bg-text px-4 py-3 text-white shadow-pop md:bottom-6"
      role="status"
    >
      <span :style="{ font: 'var(--font-body)' }">{{ toast.current.message }}</span>
      <button
        v-if="toast.current.undo"
        class="shrink-0 text-sage-300"
        :style="{ font: 'var(--font-body-strong)' }"
        @click="toast.runUndo()"
      >
        復原
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(12px);
  opacity: 0;
}
</style>
