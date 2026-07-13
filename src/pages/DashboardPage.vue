<script setup lang="ts">
/**
 * Dashboard — wireframe 1a, spec §3.1.
 *
 * The hero number is monthStats.actual (實際花費), NOT .spent. Front a $600 hotpot for
 * three and `spent` says $600 while `actual` says $200 — only one of those is what the
 * evening cost you. Getting this backwards is the exact inaccuracy the product exists to
 * fix (spec §3.4).
 */
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Bell, Plus, Users } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import TransactionRow from '@/components/ledger/TransactionRow.vue'
import { useLedgerStore } from '@/stores/ledger'

const ledger = useLedgerStore()
const router = useRouter()

const budgetTotal = computed(() => ledger.currentBudget?.total ?? 0)
const spentPct = computed(() =>
  budgetTotal.value === 0
    ? 0
    : Math.min(100, Math.round((ledger.monthStats.actual / budgetTotal.value) * 100)),
)
const remaining = computed(() => budgetTotal.value - ledger.monthStats.actual)

/** Over budget → 陶土; nearing it → 赭黃; otherwise the deep sage (design-system.md §5.6). */
const barColor = computed(() => {
  if (spentPct.value > 100) return 'var(--payable)'
  if (spentPct.value >= 80) return 'var(--warn)'
  return 'var(--sage-900)'
})

const recent = computed(() => [...ledger.liveTransactions].sort(byDateDesc).slice(0, 3))

function byDateDesc(a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) {
  // Same-day rows fall back to insertion order (spec §6.4).
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

const monthLabel = computed(() => `${Number(ledger.currentMonth.slice(5, 7))} 月`)
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex items-center justify-between">
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">分分帳 SayPay</h1>
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="通知"
      >
        <Bell :size="20" />
      </button>
    </header>

    <!-- Hero: the one card in the app with a solid fill (design-system.md §5.2) -->
    <AppCard hero>
      <p class="text-text-secondary" :style="{ font: 'var(--font-caption)' }">
        本月支出 · {{ monthLabel }}
      </p>
      <p class="mt-1">
        <MoneyText :cents="ledger.monthStats.actual" size="hero" class="!text-sage-900" />
      </p>

      <div v-if="budgetTotal > 0" class="mt-4">
        <div class="h-2 w-full overflow-hidden rounded-pill" style="background: var(--sage-50)">
          <div
            class="h-full rounded-pill transition-[width] duration-300 ease-out"
            :style="{ width: `${Math.min(100, spentPct)}%`, background: barColor }"
          />
        </div>
        <div class="mt-2 flex justify-between" :style="{ font: 'var(--font-caption)' }">
          <span class="text-text-secondary">
            預算 <span class="money">${{ Math.round(budgetTotal / 100).toLocaleString() }}</span>
          </span>
          <span :class="remaining < 0 ? 'text-payable' : 'text-text-secondary'">
            {{ remaining < 0 ? '超支' : '剩' }}
            <span class="money">
              ${{ Math.abs(Math.round(remaining / 100)).toLocaleString() }}
            </span>
          </span>
        </div>
      </div>
    </AppCard>

    <!-- Owed / owing. Both colour AND sign carry the direction (design-system.md §5.7, §7). -->
    <div class="grid grid-cols-2 gap-3">
      <RouterLink :to="{ name: 'split', query: { filter: 'receivable' } }" class="card block">
        <p class="text-text-secondary" :style="{ font: 'var(--font-caption)' }">誰欠我</p>
        <p class="mt-1">
          <MoneyText :cents="ledger.balances.receivable" tone="signed" size="display" />
        </p>
      </RouterLink>

      <RouterLink :to="{ name: 'split', query: { filter: 'payable' } }" class="card block">
        <p class="text-text-secondary" :style="{ font: 'var(--font-caption)' }">我欠誰</p>
        <p class="mt-1">
          <MoneyText :cents="-ledger.balances.payable" tone="signed" size="display" />
        </p>
      </RouterLink>
    </div>

    <AppCard title="最近記錄">
      <template #action>
        <RouterLink
          :to="{ name: 'ledger' }"
          class="text-sage-700"
          :style="{ font: 'var(--font-label)' }"
        >
          See all
        </RouterLink>
      </template>

      <p
        v-if="recent.length === 0"
        class="py-6 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        還沒有記錄，記下今天的第一筆吧
      </p>
      <div v-else class="divide-y divide-border">
        <TransactionRow v-for="tx in recent" :key="tx.id" :tx="tx" />
      </div>
    </AppCard>

    <!-- Quick actions, lifted from wireframe 1c -->
    <div class="grid grid-cols-2 gap-3">
      <button class="btn-secondary" @click="router.push({ name: 'tx-new' })">
        <Plus :size="20" /> 記一筆
      </button>
      <button
        class="btn-secondary"
        @click="router.push({ name: 'tx-new', query: { split: '1' } })"
      >
        <Users :size="20" /> 分一筆
      </button>
    </div>
  </div>
</template>
