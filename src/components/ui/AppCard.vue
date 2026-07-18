<script setup lang="ts">
/**
 * The standard card — design-system.md §5.1.
 * No shadow: this design separates with hairlines and whitespace, not elevation.
 *
 * `hero` is the ONE card allowed a solid fill (§5.2). It is the visual anchor of the
 * Dashboard, and there is only ever one per screen.
 */
withDefaults(defineProps<{ hero?: boolean; title?: string }>(), { hero: false })
</script>

<template>
  <section :class="hero ? 'card-hero' : 'card'">
    <header v-if="title || $slots.action" class="mb-3 flex items-center justify-between">
      <h2 v-if="title" :style="{ font: 'var(--font-h2)' }" class="text-text">{{ title }}</h2>
      <slot name="action" />
    </header>
    <slot />
  </section>
</template>
