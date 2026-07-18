<script setup lang="ts">
/**
 * Category glyph — design-system.md §4.
 * Line icons only, never filled, always inheriting the text colour. The circle is a
 * hairline border rather than a colour chip: a solid fill here would compete with the
 * hero card, which is meant to be the only voice on the screen (§0).
 */
import { computed, type Component } from 'vue'
import {
  Bus,
  CarTaxiFront,
  CircleEllipsis,
  Clapperboard,
  Gamepad2,
  House,
  ShoppingBag,
  ShoppingBasket,
  TrainFront,
  Utensils,
  Wallet,
} from '@lucide/vue'

import { useLedgerStore } from '@/stores/ledger'

const props = withDefaults(defineProps<{ categoryId: string; size?: number }>(), { size: 32 })

const ledger = useLedgerStore()

/** Category.icon holds a lucide name (spec §4.6); map it to the component. */
const ICONS: Record<string, Component> = {
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  bus: Bus,
  'train-front': TrainFront,
  'car-taxi-front': CarTaxiFront,
  'gamepad-2': Gamepad2,
  clapperboard: Clapperboard,
  'shopping-bag': ShoppingBag,
  house: House,
  wallet: Wallet,
  'circle-ellipsis': CircleEllipsis,
}

const category = computed(() => ledger.categoryById.get(props.categoryId))
const icon = computed(() => ICONS[category.value?.icon ?? ''] ?? CircleEllipsis)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-pill border border-border text-text-secondary"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="category?.name"
  >
    <component :is="icon" :size="Math.round(size * 0.5)" />
  </span>
</template>
