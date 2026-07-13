<script setup lang="ts">
/**
 * Second confirmation for the two irreversible-ish actions on this page (spec §3.3.3):
 *  - settling MORE than the current net (the balance flips direction)
 *  - deleting a Settlement
 *
 * Voice: state what will happen, don't scold (design-system.md §9).
 */
import SplitDialog from './SplitDialog.vue'

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmText?: string
    danger?: boolean
  }>(),
  { confirmText: '確定', danger: false },
)

const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <SplitDialog :title="title" @close="emit('close')">
    <p class="text-text" :style="{ font: 'var(--font-body)' }">{{ message }}</p>

    <template #footer>
      <button class="btn-ghost flex-1" @click="emit('close')">取消</button>
      <button :class="danger ? 'btn-danger' : 'btn-primary'" class="flex-1" @click="emit('confirm')">
        {{ confirmText }}
      </button>
    </template>
  </SplitDialog>
</template>
