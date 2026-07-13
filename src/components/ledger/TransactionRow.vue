<script setup lang="ts">
/**
 * One ledger row — the display rule in spec §1.4, and the reason it matters:
 *
 *   main amount  = t.amount        ($600)   ← what actually happened
 *   sub caption  = 分帳 · 我的 $200          ← the derived reading
 *
 * The list is a record of events, so $600 is the truth of that hotpot; $200 is a
 * derivative of it. Showing $200 as the headline would leave the user unable to
 * reconcile the row against their credit-card statement.
 */
import { computed } from 'vue'

import MoneyText from '@/components/ui/MoneyText.vue'
import CategoryIcon from '@/components/ledger/CategoryIcon.vue'
import { myShare } from '@/core/stats'
import { useLedgerStore } from '@/stores/ledger'
import type { Transaction } from '@/core/types'

const props = defineProps<{ tx: Transaction }>()

const ledger = useLedgerStore()

const categoryName = computed(() => ledger.categoryById.get(props.tx.category)?.name ?? '')
const share = computed(() => myShare(props.tx, ledger.selfId))
const isIncome = computed(() => props.tx.type === 'income')

/** Someone else fronted this one — worth saying, or the $600 looks like my cash out. */
const payer = computed(() => {
  if (!props.tx.isSplit || props.tx.paidBy === ledger.selfId) return null
  return ledger.liveMembers.find((m) => m.id === props.tx.paidBy)?.name ?? null
})

const subtitle = computed(() =>
  [categoryName.value, payer.value ? `${payer.value} 付` : null, props.tx.note]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <div class="flex items-center gap-3 py-3">
    <CategoryIcon :category-id="tx.category" />

    <div class="min-w-0 flex-1">
      <p class="truncate text-text" :style="{ font: 'var(--font-body-strong)' }">{{ tx.title }}</p>
      <p
        v-if="subtitle"
        class="truncate text-text-tertiary"
        :style="{ font: 'var(--font-caption)' }"
      >
        {{ subtitle }}
      </p>
    </div>

    <div class="shrink-0 text-right">
      <!-- Income is signed (+, green); an expense is a plain neutral amount. -->
      <MoneyText
        :cents="tx.amount"
        :tone="isIncome ? 'signed' : 'plain'"
        size="strong"
        class="block"
      />
      <p
        v-if="tx.isSplit"
        class="text-text-tertiary"
        :style="{ font: 'var(--font-caption)' }"
      >
        分帳 · 我的
        <MoneyText :cents="share" size="caption" class="!text-text-tertiary" />
      </p>
    </div>
  </div>
</template>
