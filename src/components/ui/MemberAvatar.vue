<script setup lang="ts">
/**
 * Member avatar — design-system.md §5.8. Colour fill + first character; no photos in MVP.
 */
import { computed } from 'vue'
import type { Member } from '@/core/types'

const props = withDefaults(defineProps<{ member: Member; size?: number }>(), { size: 28 })

const initial = computed(() => [...props.member.name][0] ?? '?')
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-pill text-white"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: member.avatarColor,
      fontSize: `${Math.round(size * 0.42)}px`,
      fontWeight: 500,
    }"
    :title="member.name"
    >{{ initial }}</span
  >
</template>
