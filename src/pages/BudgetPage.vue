<script setup lang="ts">
/**
 * 預算 — wireframe 1j, spec §3.5.
 *
 * Budgets exist ONLY on parent categories (decision #35). A child budget would make
 * "parent $8,000 vs children summing to $9,000" an unanswerable question, so leaf spend is
 * rolled up to the parent before it is compared against anything.
 *
 * There is no group budget and no rollover.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Pencil } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import { budgetState, daysLeftInMonth } from '@/core/budgetAlerts'
import { formatMoney } from '@/core/money'
import { useLedgerStore } from '@/stores/ledger'

const ledger = useLedgerStore()
const router = useRouter()

const budget = computed(() => ledger.currentBudget)
const total = computed(() => budget.value?.total ?? 0)
const used = computed(() => ledger.monthStats.actual)

const pct = computed(() =>
  total.value === 0 ? 0 : Math.round((used.value / total.value) * 100),
)
const daysLeft = computed(() => daysLeftInMonth())

const rows = computed(() =>
  Object.entries(budget.value?.byCategory ?? {}).map(([categoryId, limit]) => {
    const spent = ledger.monthSpendByParent.get(categoryId) ?? 0
    const state = budgetState(spent, limit)
    return {
      categoryId,
      name: ledger.categoryById.get(categoryId)?.name ?? categoryId,
      spent,
      limit,
      state,
      pct: limit === 0 ? 0 : Math.round((spent / limit) * 100),
      over: Math.max(0, spent - limit),
      left: Math.max(0, limit - spent),
    }
  }),
)

const colorFor = (state: string) =>
  state === 'over' ? 'var(--payable)' : state === 'warning' ? 'var(--warn)' : 'var(--sage-900)'

// The ring is drawn with a dash offset rather than a chart — it's one number, not a series.
const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const ringOffset = computed(() => CIRCUMFERENCE * (1 - Math.min(100, pct.value) / 100))
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">預算管理</h1>
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="編輯預算"
        @click="router.push({ name: 'budget-edit' })"
      >
        <Pencil :size="18" />
      </button>
    </header>

    <AppCard v-if="!budget">
      <p class="py-6 text-center text-text-tertiary" :style="{ font: 'var(--font-body)' }">
        這個月還沒有設定預算
      </p>
    </AppCard>

    <template v-else>
      <AppCard hero>
        <div class="flex flex-col items-center">
          <svg width="128" height="128" viewBox="0 0 128 128" class="-rotate-90">
            <circle
              cx="64"
              cy="64"
              :r="RADIUS"
              fill="none"
              stroke="var(--sage-50)"
              stroke-width="10"
            />
            <circle
              cx="64"
              cy="64"
              :r="RADIUS"
              fill="none"
              :stroke="colorFor(budgetState(used, total))"
              stroke-width="10"
              stroke-linecap="round"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="ringOffset"
              class="transition-[stroke-dashoffset] duration-300 ease-out"
            />
          </svg>
          <p class="-mt-20 mb-14 money text-sage-900" :style="{ font: 'var(--font-display)' }">
            {{ pct }}%
          </p>
          <p class="text-text-secondary" :style="{ font: 'var(--font-caption)' }">
            本月預算 {{ formatMoney(total) }} · 已用 {{ formatMoney(used) }}
          </p>
        </div>
      </AppCard>

      <AppCard title="分類預算">
        <div class="flex flex-col gap-4">
          <div v-for="r in rows" :key="r.categoryId">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-text" :style="{ font: 'var(--font-body)' }">
                {{ r.name }}
                <span
                  v-if="r.state === 'over'"
                  class="ml-1 text-payable"
                  :style="{ font: 'var(--font-caption)' }"
                  >超支</span
                >
              </span>
              <span class="money text-text-secondary" :style="{ font: 'var(--font-caption)' }">
                {{ Math.round(r.spent / 100).toLocaleString() }} /
                {{ Math.round(r.limit / 100).toLocaleString() }}
              </span>
            </div>

            <div
              class="h-2 w-full overflow-hidden rounded-pill"
              style="background: var(--sage-100)"
              role="progressbar"
              :aria-valuenow="r.pct"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                class="h-full rounded-pill transition-[width] duration-300 ease-out"
                :style="{
                  width: `${Math.min(100, r.pct)}%`,
                  // Overspend is encoded three ways — colour, stripes, and the words below —
                  // because colour alone is not accessible (design-system.md §5.6, §7).
                  background:
                    r.state === 'over'
                      ? 'repeating-linear-gradient(45deg, var(--payable) 0 6px, var(--payable-soft) 6px 12px)'
                      : colorFor(r.state),
                }"
              />
            </div>

            <p
              v-if="r.state === 'over'"
              class="mt-1 text-payable"
              :style="{ font: 'var(--font-caption)' }"
            >
              {{ r.name }}已超支 {{ formatMoney(r.over) }} · 本月還有 {{ daysLeft }} 天
            </p>
            <p
              v-else-if="r.state === 'warning'"
              class="mt-1 text-warn"
              :style="{ font: 'var(--font-caption)' }"
            >
              {{ r.name }}已用 {{ r.pct }}%，剩 {{ formatMoney(r.left) }}
            </p>
          </div>
        </div>
      </AppCard>
    </template>
  </div>
</template>
