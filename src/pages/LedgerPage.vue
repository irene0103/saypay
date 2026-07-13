<script setup lang="ts">
/**
 * Ledger — wireframe 1b, spec §3.1.1.
 *
 * The calendar is not decoration: both 天天記帳 and 簡單記帳 make it the primary way people
 * review their books, which is why spec §3.1.1 pulled it forward into Phase 1. It lives
 * here as a view toggle rather than replacing the Dashboard.
 *
 * Daily totals are 實際花費 (my share), consistent with every other spend figure (§3.4).
 */
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, Search, X } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import TransactionRow from '@/components/ledger/TransactionRow.vue'
import { daysInMonth, localDayKey, monthStart, myShare, shiftMonthKey } from '@/core/stats'
import { useLedgerStore } from '@/stores/ledger'
import type { Transaction } from '@/core/types'

const ledger = useLedgerStore()

const view = ref<'list' | 'calendar'>('list')
const query = ref('')
const searching = ref(false)
const selectedDay = ref<string | null>(null)

// ---- Search (spec §3.10): title, note, category, member names ----
const filtered = computed<Transaction[]>(() => {
  const q = query.value.trim().toLowerCase()
  const rows = [...ledger.monthTransactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
  if (!q) return rows

  const memberName = (id: string) => ledger.liveMembers.find((m) => m.id === id)?.name ?? ''
  return rows.filter((t) =>
    [
      t.title,
      t.note ?? '',
      ledger.categoryById.get(t.category)?.name ?? '',
      ...t.members.map(memberName),
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

// ---- Month summary ----
const summary = computed(() => ledger.monthStats)
const balance = computed(() => summary.value.income - summary.value.actual)

// ---- Calendar grid ----
const cursor = computed(() => monthStart(ledger.currentMonth))

/** Daily 實際花費, keyed by local day (spec §6.4: a 1am purchase belongs to that day). */
const spendByDay = computed(() => {
  const map = new Map<string, number>()
  for (const t of ledger.monthTransactions) {
    if (t.type !== 'expense') continue
    const share = myShare(t, ledger.selfId)
    if (share === 0) continue
    const key = localDayKey(new Date(t.date))
    map.set(key, (map.get(key) ?? 0) + share)
  }
  return map
})

const cells = computed(() => {
  const first = cursor.value
  const year = first.getFullYear()
  const month = first.getMonth()
  const total = daysInMonth(ledger.currentMonth)
  // Pad so the 1st lands under its real weekday.
  const lead = first.getDay()

  const out: { key: string | null; day: number | null }[] = []
  for (let i = 0; i < lead; i++) out.push({ key: null, day: null })
  for (let d = 1; d <= total; d++) {
    out.push({ key: localDayKey(new Date(year, month, d)), day: d })
  }
  return out
})

const dayTransactions = computed(() =>
  selectedDay.value
    ? ledger.monthTransactions.filter((t) => localDayKey(new Date(t.date)) === selectedDay.value)
    : [],
)

function shiftMonth(delta: number) {
  ledger.currentMonth = shiftMonthKey(ledger.currentMonth, delta)
  selectedDay.value = null
}

function toggleSearch() {
  searching.value = !searching.value
  if (!searching.value) query.value = ''
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">帳本</h1>
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        :aria-label="searching ? '關閉搜尋' : '搜尋'"
        @click="toggleSearch"
      >
        <component :is="searching ? X : Search" :size="20" />
      </button>
    </header>

    <input
      v-if="searching"
      v-model="query"
      class="input w-full"
      placeholder="搜尋標題、備註、類別、成員"
      autofocus
    />

    <!-- streak: light encouragement, never anxiety (design-system.md §9) -->
    <p
      v-if="ledger.streak > 0"
      class="text-text-secondary"
      :style="{ font: 'var(--font-caption)' }"
    >
      已連續記帳 {{ ledger.streak }} 天 🔥
    </p>

    <!-- Month nav + summary -->
    <AppCard>
      <div class="flex items-center justify-between">
        <button
          class="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
          aria-label="上個月"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="20" />
        </button>
        <span class="text-text" :style="{ font: 'var(--font-h2)' }">{{ ledger.currentMonth }}</span>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
          aria-label="下個月"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="20" />
        </button>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">支出</p>
          <MoneyText :cents="summary.actual" size="strong" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">收入</p>
          <MoneyText :cents="summary.income" size="strong" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">結餘</p>
          <MoneyText :cents="balance" tone="signed" size="strong" />
        </div>
      </div>
    </AppCard>

    <!-- View toggle -->
    <div class="flex gap-2">
      <button
        v-for="v in (['list', 'calendar'] as const)"
        :key="v"
        class="h-7 rounded-sm px-3 transition-colors"
        :class="view === v ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
        :style="{ font: 'var(--font-label)' }"
        @click="view = v"
      >
        {{ v === 'list' ? '清單' : '日曆' }}
      </button>
    </div>

    <!-- List -->
    <AppCard v-if="view === 'list'">
      <p
        v-if="filtered.length === 0"
        class="py-6 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        {{ query ? '沒有符合的記錄' : '還沒有記錄，記下今天的第一筆吧' }}
      </p>
      <div v-else class="divide-y divide-border">
        <TransactionRow v-for="tx in filtered" :key="tx.id" :tx="tx" />
      </div>
    </AppCard>

    <!-- Calendar -->
    <template v-else>
      <AppCard>
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="w in WEEKDAYS"
            :key="w"
            class="pb-1 text-center text-text-tertiary"
            :style="{ font: 'var(--font-micro)' }"
          >
            {{ w }}
          </div>

          <button
            v-for="(cell, i) in cells"
            :key="i"
            class="flex aspect-square flex-col items-center justify-center rounded-sm transition-colors"
            :class="[
              cell.key === null ? 'pointer-events-none' : '',
              // Days with activity get a tint — that tint IS the at-a-glance signal.
              cell.key && spendByDay.get(cell.key) ? 'bg-sage-50' : '',
              selectedDay === cell.key ? 'ring-2 ring-sage-500' : '',
            ]"
            :disabled="cell.key === null"
            @click="selectedDay = selectedDay === cell.key ? null : cell.key"
          >
            <span
              v-if="cell.day"
              class="text-text"
              :style="{ font: 'var(--font-caption)' }"
              >{{ cell.day }}</span
            >
            <span
              v-if="cell.key && spendByDay.get(cell.key)"
              class="money text-text-secondary"
              :style="{ font: 'var(--font-micro)' }"
            >
              {{ Math.round((spendByDay.get(cell.key) ?? 0) / 100) }}
            </span>
          </button>
        </div>
      </AppCard>

      <AppCard v-if="selectedDay" :title="selectedDay">
        <p
          v-if="dayTransactions.length === 0"
          class="py-4 text-center text-text-tertiary"
          :style="{ font: 'var(--font-body)' }"
        >
          這天沒有記錄
        </p>
        <div v-else class="divide-y divide-border">
          <TransactionRow v-for="tx in dayTransactions" :key="tx.id" :tx="tx" />
        </div>
      </AppCard>
    </template>
  </div>
</template>
