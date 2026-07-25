<script setup lang="ts">
/**
 * 預算編輯 — spec §3.5.
 *
 * One monthly total plus a per-PARENT-category limit (§3.5, decision #35): child spend
 * rolls up to the parent, so budgets only ever live at parent level. No group budget, no
 * rollover. Amounts are entered in 元 and stored as cents.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import CategoryIcon from '@/components/ledger/CategoryIcon.vue'
import { toCents } from '@/core/money'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

const month = computed(() => ledger.currentMonth)

// Working copy in 元; seeded from the current month's budget, if any.
const totalYuan = ref(0)
const perCategoryYuan = ref<Record<string, number>>({})

/**
 * Budgetable parents only — income is never part of a budget (spec §3.4, §3.5), so the
 * 收入 category has no place on this screen.
 */
const budgetableParents = computed(() =>
  ledger.parentCategories.filter((c) => c.id !== 'c-income'),
)

function seed() {
  const b = ledger.currentBudget
  totalYuan.value = b ? Math.round(b.total / 100) : 0
  const map: Record<string, number> = {}
  for (const parent of budgetableParents.value) {
    const cents = b?.byCategory[parent.id] ?? 0
    map[parent.id] = cents ? Math.round(cents / 100) : 0
  }
  perCategoryYuan.value = map
}
watch(() => ledger.currentBudget, seed, { immediate: true })

/** Budgets can't be negative — clamp on input, and block the minus key. */
function nonNeg(raw: string): number {
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}
function blockNegativeKey(e: KeyboardEvent) {
  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault()
}

/** Category limits sum higher than the total → surface it, but don't block (§3.5 has no such rule). */
const categorySum = computed(() =>
  Object.values(perCategoryYuan.value).reduce((a, v) => a + (Number(v) || 0), 0),
)
const overAllocated = computed(() => categorySum.value > totalYuan.value && totalYuan.value > 0)

async function save() {
  const byCategory: Record<string, number> = {}
  for (const [id, yuan] of Object.entries(perCategoryYuan.value)) {
    const v = Number(yuan) || 0
    if (v > 0) byCategory[id] = toCents(v)
  }
  await ledger.saveBudget({
    month: month.value,
    total: toCents(Number(totalYuan.value) || 0),
    byCategory,
  })
  toast.show('已儲存預算')
  router.back()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center gap-2">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="返回"
        @click="router.back()"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">預算設定</h1>
    </header>

    <AppCard :title="`本月總預算 · ${month}`">
      <div class="flex items-baseline gap-2">
        <span class="text-text-tertiary" :style="{ font: 'var(--font-display)' }">$</span>
        <input
          :value="totalYuan || ''"
          type="number"
          min="0"
          inputmode="numeric"
          class="money w-full border-none bg-transparent text-text outline-none"
          :style="{ font: 'var(--font-display)' }"
          aria-label="總預算"
          @input="totalYuan = nonNeg(($event.target as HTMLInputElement).value)"
          @keydown="blockNegativeKey"
        />
      </div>
    </AppCard>

    <AppCard title="分類預算">
      <template #action>
        <span
          v-if="overAllocated"
          class="text-warn"
          :style="{ font: 'var(--font-caption)' }"
        >
          分類加總已超過總預算
        </span>
      </template>

      <div class="flex flex-col gap-3">
        <div
          v-for="parent in budgetableParents"
          :key="parent.id"
          class="flex items-center gap-3"
        >
          <CategoryIcon :category-id="parent.id" :size="28" />
          <span class="flex-1 text-text" :style="{ font: 'var(--font-body)' }">
            {{ parent.name }}
          </span>
          <span class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">$</span>
          <input
            :value="perCategoryYuan[parent.id] || ''"
            type="number"
            min="0"
            inputmode="numeric"
            class="input money !h-9 w-28 text-right"
            :aria-label="`${parent.name} 預算`"
            @input="perCategoryYuan[parent.id] = nonNeg(($event.target as HTMLInputElement).value)"
            @keydown="blockNegativeKey"
          />
        </div>
      </div>
    </AppCard>

    <button class="btn-primary w-full" @click="save">儲存預算</button>
  </div>
</template>
