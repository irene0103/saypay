<script setup lang="ts">
/**
 * 帳本首頁 — reference layout 圖1.
 *
 * Week calendar → today's summary (支出 / 收入 / 待收款 / 待付款) → that day's transactions
 * → a big 新增一筆記帳 button. Semantic colours stay from the design system (應收 sage,
 * 應付 陶土), only the layout follows the reference.
 *
 * 待收款/待付款 are the pairwise balances (spec §5.3) — they are whole-ledger figures, not
 * per-day, so they read the same regardless of the selected day.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, Search, Bell, Sprout, Plus, MoreVertical } from '@lucide/vue'

import MoneyText from '@/components/ui/MoneyText.vue'
import CategoryIcon from '@/components/ledger/CategoryIcon.vue'
import { localDayKey, myShare } from '@/core/stats'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import type { Transaction } from '@/core/types'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const selectedKey = ref(localDayKey(new Date()))
const selectedDate = computed(() => {
  const [y, m, d] = selectedKey.value.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d))
})

const monthLabel = computed(
  () => `${selectedDate.value.getFullYear()}年${selectedDate.value.getMonth() + 1}月`,
)

// ---- The week (Mon–Sun) containing the selected day ----
const weekDays = computed(() => {
  const base = selectedDate.value
  const dow = (base.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(base)
  monday.setDate(base.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { key: localDayKey(d), day: d.getDate() }
  })
})

function shiftWeek(delta: number) {
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() + delta * 7)
  selectedKey.value = localDayKey(d)
}

// ---- Days with activity get a dot ----
const activeDays = computed(() => {
  const s = new Set<string>()
  for (const t of ledger.liveTransactions) s.add(localDayKey(new Date(t.date)))
  return s
})

// ---- Selected day's transactions + summary ----
const dayTransactions = computed(() =>
  ledger.liveTransactions
    .filter((t) => localDayKey(new Date(t.date)) === selectedKey.value)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
)

const daySummary = computed(() => {
  let expense = 0
  let income = 0
  for (const t of dayTransactions.value) {
    if (t.type === 'income') income += t.amount
    else expense += myShare(t, ledger.selfId)
  }
  return { expense, income }
})

const dayTitle = computed(() => {
  const d = selectedDate.value
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[(d.getDay() + 6) % 7]}`
})

function categoryName(id: string) {
  return ledger.categoryById.get(id)?.name ?? ''
}
function subtitle(t: Transaction) {
  const payer =
    t.isSplit && t.paidBy !== ledger.selfId
      ? (ledger.liveMembers.find((m) => m.id === t.paidBy)?.name ?? null)
      : null
  return [categoryName(t.category), t.isSplit ? `與 ${t.members.length} 人分帳` : null, payer ? `${payer} 付` : null, t.note]
    .filter(Boolean)
    .join(' · ')
}

function edit(id: string) {
  router.push({ name: 'tx-edit', params: { id } })
}
async function removeTx(id: string) {
  const tombstoned = await ledger.softDeleteTransaction(id)
  if (tombstoned) toast.show('已刪除', () => ledger.restoreTransaction(tombstoned.id))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Header -->
    <header class="flex items-center gap-2 pt-1">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text hover:bg-surface-alt"
        aria-label="選單"
        @click="router.push({ name: 'settings' })"
      >
        <Menu :size="22" />
      </button>
      <button class="flex items-center gap-1 text-text" :style="{ font: 'var(--font-h1)' }">
        {{ monthLabel }}
      </button>
      <span class="flex-1" />
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="搜尋"
        @click="router.push({ name: 'ledger' })"
      >
        <Search :size="20" />
      </button>
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="通知"
        @click="toast.show('目前沒有新通知')"
      >
        <Bell :size="20" />
      </button>
      <Sprout :size="26" class="text-sage-500" />
    </header>

    <!-- Week calendar -->
    <div>
      <div class="grid grid-cols-7 text-center">
        <span
          v-for="w in WEEKDAYS"
          :key="w"
          class="pb-2 text-text-tertiary"
          :style="{ font: 'var(--font-caption)' }"
          >{{ w }}</span
        >
      </div>
      <div class="grid grid-cols-7 text-center" @touchstart.passive="() => {}">
        <button
          v-for="cell in weekDays"
          :key="cell.key"
          class="flex flex-col items-center gap-1 py-1"
          @click="selectedKey = cell.key"
        >
          <span
            class="flex h-9 w-9 items-center justify-center rounded-pill money transition-colors"
            :class="
              selectedKey === cell.key
                ? 'bg-sage-500 text-white'
                : 'text-text hover:bg-surface-alt'
            "
            :style="{ font: 'var(--font-body)' }"
            >{{ cell.day }}</span
          >
          <span
            class="h-1 w-1 rounded-pill"
            :class="activeDays.has(cell.key) && selectedKey !== cell.key ? 'bg-sage-300' : 'bg-transparent'"
          />
        </button>
      </div>
      <div class="mt-1 flex justify-between">
        <button
          class="px-2 text-text-tertiary hover:text-text"
          :style="{ font: 'var(--font-caption)' }"
          @click="shiftWeek(-1)"
        >
          ‹ 上週
        </button>
        <button
          class="px-2 text-text-tertiary hover:text-text"
          :style="{ font: 'var(--font-caption)' }"
          @click="selectedKey = localDayKey(new Date())"
        >
          今天
        </button>
        <button
          class="px-2 text-text-tertiary hover:text-text"
          :style="{ font: 'var(--font-caption)' }"
          @click="shiftWeek(1)"
        >
          下週 ›
        </button>
      </div>
    </div>

    <!-- Day summary -->
    <section class="card">
      <p class="mb-3 text-text-secondary" :style="{ font: 'var(--font-caption)' }">今日摘要</p>
      <div class="grid grid-cols-4 gap-1 text-center">
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">支出</p>
          <MoneyText :cents="daySummary.expense" size="strong" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">收入</p>
          <MoneyText :cents="daySummary.income" size="strong" />
        </div>
        <button class="block" @click="router.push({ name: 'split', query: { filter: 'receivable' } })">
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">待收款</p>
          <MoneyText :cents="ledger.balances.receivable" size="strong" class="!text-receivable" />
        </button>
        <button class="block" @click="router.push({ name: 'split', query: { filter: 'payable' } })">
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">待付款</p>
          <MoneyText :cents="ledger.balances.payable" size="strong" class="!text-payable" />
        </button>
      </div>
    </section>

    <!-- Day header -->
    <div class="flex items-center justify-between px-1">
      <span class="text-text" :style="{ font: 'var(--font-body-strong)' }">{{ dayTitle }}</span>
      <span class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
        支出 <span class="money">${{ Math.round(daySummary.expense / 100).toLocaleString() }}</span>
      </span>
    </div>

    <!-- Day transactions -->
    <section class="card !p-0">
      <p
        v-if="dayTransactions.length === 0"
        class="py-8 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        這天還沒有記錄
      </p>
      <div v-else class="divide-y divide-border">
        <div v-for="t in dayTransactions" :key="t.id" class="flex items-center gap-3 px-4 py-3">
          <CategoryIcon :category-id="t.category" :size="40" />

          <button class="min-w-0 flex-1 text-left" @click="edit(t.id)">
            <p class="truncate text-text" :style="{ font: 'var(--font-body-strong)' }">
              {{ t.title }}
            </p>
            <p class="truncate text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
              {{ subtitle(t) }}
            </p>
          </button>

          <div class="shrink-0 text-right">
            <MoneyText
              :cents="t.amount"
              :tone="t.type === 'income' ? 'signed' : 'plain'"
              size="strong"
              class="block"
            />
            <p
              v-if="t.isSplit"
              class="text-text-tertiary"
              :style="{ font: 'var(--font-caption)' }"
            >
              我的
              <MoneyText :cents="myShare(t, ledger.selfId)" size="caption" class="!text-text-tertiary" />
            </p>
          </div>

          <button
            class="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-alt hover:text-payable"
            aria-label="刪除"
            @click="removeTx(t.id)"
          >
            <MoreVertical :size="18" />
          </button>
        </div>
      </div>
    </section>

    <!-- Add -->
    <button class="btn-primary w-full !h-12" @click="router.push({ name: 'tx-new' })">
      <Plus :size="20" /> 新增一筆記帳
    </button>
  </div>
</template>
