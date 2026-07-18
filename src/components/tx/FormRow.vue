<script setup lang="ts">
/**
 * One row of the list-style entry form — reference layout 圖2/圖3.
 * `icon + label` on the left, a value (default slot) + chevron on the right. When `active`,
 * the chevron rotates down to signal the row's picker is open below it.
 */
import { ChevronRight } from '@lucide/vue'
import type { Component } from 'vue'

withDefaults(
  defineProps<{ icon: Component; label: string; active?: boolean; chevron?: boolean }>(),
  { active: false, chevron: true },
)
defineEmits<{ tap: [] }>()
</script>

<template>
  <button
    class="flex w-full items-center gap-3 py-3.5 text-left transition-colors"
    @click="$emit('tap')"
  >
    <component :is="icon" :size="20" class="shrink-0 text-text-secondary" />
    <span class="text-text" :style="{ font: 'var(--font-body)' }">{{ label }}</span>
    <span class="min-w-0 flex-1" />
    <span class="flex items-center gap-1 text-text" :style="{ font: 'var(--font-body)' }">
      <slot />
    </span>
    <ChevronRight
      v-if="chevron"
      :size="18"
      class="shrink-0 text-text-tertiary transition-transform"
      :class="active ? 'rotate-90' : ''"
    />
  </button>
</template>
