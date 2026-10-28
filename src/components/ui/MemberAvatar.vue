<script setup lang="ts">
/**
 * Member avatar — design-system.md §5.8. Colour fill + first character; no photos in MVP.
 */
import { computed } from 'vue'
import type { Member } from '@/core/types'

const props = withDefaults(defineProps<{ member: Member; size?: number }>(), { size: 28 })

const initial = computed(() => [...props.member.name][0] ?? '?')

/**
 * White or dark initial, whichever reads better on this fill. The palette is mostly light
 * sage/sand, where white sits around 2–3:1; colours are stored per member, so this is
 * decided at render time and fixes existing members too.
 */
const DARK = '#2a2a23'
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const textColor = computed(() => {
  const bg = luminance(props.member.avatarColor)
  const vsWhite = 1.05 / (bg + 0.05)
  const vsDark = (bg + 0.05) / (luminance(DARK) + 0.05)
  return vsDark > vsWhite ? DARK : '#ffffff'
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-pill"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: member.avatarColor,
      color: textColor,
      fontSize: `${Math.round(size * 0.42)}px`,
      fontWeight: 500,
    }"
    :title="member.name"
    >{{ initial }}</span
  >
</template>
