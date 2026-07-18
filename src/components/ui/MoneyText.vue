<script setup lang="ts">
/**
 * Every amount in the app renders through here.
 *
 * Two things it guarantees, both from design-system.md:
 *  - tabular-nums, so columns of money line up and the hero figure doesn't twitch (§2.1)
 *  - receivable/payable carry a SIGN as well as a colour, because colour alone is not an
 *    accessible encoding (§5.7, §7)
 */
import { computed } from 'vue'
import { formatMoney } from '@/core/money'
import type { Cents } from '@/core/types'

const props = withDefaults(
  defineProps<{
    cents: Cents
    /** 'signed' colours by direction and prefixes +/−. 'plain' is a neutral amount. */
    tone?: 'plain' | 'signed'
    size?: 'hero' | 'display' | 'body' | 'strong' | 'caption'
  }>(),
  { tone: 'plain', size: 'body' },
)

const text = computed(() => formatMoney(props.cents, { sign: props.tone === 'signed' }))

const colorClass = computed(() => {
  if (props.tone !== 'signed') return 'text-text'
  if (props.cents > 0) return 'text-receivable'
  if (props.cents < 0) return 'text-payable'
  return 'text-text-secondary'
})

const sizeStyle = computed(
  () =>
    ({
      hero: 'font: var(--font-hero);',
      display: 'font: var(--font-display);',
      body: 'font: var(--font-body);',
      strong: 'font: var(--font-body-strong);',
      caption: 'font: var(--font-caption);',
    })[props.size],
)
</script>

<template>
  <span class="money" :class="colorClass" :style="sizeStyle">{{ text }}</span>
</template>
