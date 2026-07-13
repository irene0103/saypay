<script setup lang="ts">
/**
 * 分析 — wireframe 1i, spec §3.4.
 *
 * The category breakdown and the trend line are computed from 實際花費 (my share), not from
 * cash out. Front a $600 hotpot for three and a `spent`-based chart would bill 餐飲 $600
 * when the evening actually cost you $200 — which is precisely the "個人實際花費不準"
 * complaint this product was built to fix. The toggle exists, but 實際花費 is the default.
 *
 * Income never enters any expense statistic (spec §3.4).
 */
import { computed, ref } from 'vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import EChart from '@/components/analytics/EChart.vue'
import { daysInMonth, localDayKey, monthStart, myCashOut, myShare } from '@/core/stats'
import { toYuan } from '@/core/money'
import { cssVar, cssVars } from '@/lib/cssVar'
import { useLedgerStore } from '@/stores/ledger'
import type { Transaction } from '@/core/types'
import type { EChartsOption } from 'echarts'

const ledger = useLedgerStore()

type Basis = 'actual' | 'spent'
const basis = ref<Basis>('actual')
const level = ref<'parent' | 'leaf'>('parent')

/** The one switch that decides what every figure on this page means. */
const valueOf = (t: Transaction) =>
  basis.value === 'actual' ? myShare(t, ledger.selfId) : myCashOut(t, ledger.selfId)

// Resolved once at setup: a canvas cannot read var(--chart-1) (see lib/cssVar).
const CHART_COLORS = cssVars(
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
)
const INK = {
  surface: cssVar('--surface'),
  border: cssVar('--border'),
  borderStrong: cssVar('--border-strong'),
  textTertiary: cssVar('--text-tertiary'),
  sage500: cssVar('--sage-500'),
  sage50: cssVar('--sage-50'),
}

// ---- Category breakdown ----
const byCategory = computed(() => {
  const map = new Map<string, number>()
  for (const t of ledger.monthTransactions) {
    if (t.type !== 'expense') continue
    const v = valueOf(t)
    if (v === 0) continue
    const cat = ledger.categoryById.get(t.category)
    const key =
      level.value === 'parent' ? (cat?.parentId ?? t.category) : t.category
    map.set(key, (map.get(key) ?? 0) + v)
  }
  return [...map.entries()]
    .map(([id, cents]) => ({
      id,
      name: ledger.categoryById.get(id)?.name ?? '其他',
      cents,
    }))
    .sort((a, b) => b.cents - a.cents)
})

const categoryTotal = computed(() => byCategory.value.reduce((a, c) => a + c.cents, 0))

const pctOf = (cents: number) =>
  categoryTotal.value === 0 ? 0 : Math.round((cents / categoryTotal.value) * 100)

const donutOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b} {d}%' },
  color: CHART_COLORS,
  series: [
    {
      type: 'pie',
      // A ring, not a pie: the hole keeps the mark light enough to sit beside the hero.
      radius: ['58%', '82%'],
      avoidLabelOverlap: false,
      itemStyle: { borderColor: INK.surface, borderWidth: 2 },
      label: { show: false },
      data: byCategory.value.map((c) => ({ name: c.name, value: toYuan(c.cents) })),
    },
  ],
}))

// ---- Daily trend ----
const trend = computed(() => {
  const first = monthStart(ledger.currentMonth)
  const days = daysInMonth(ledger.currentMonth)

  const perDay = new Map<string, number>()
  for (const t of ledger.monthTransactions) {
    if (t.type !== 'expense') continue
    const v = valueOf(t)
    if (v === 0) continue
    const key = localDayKey(new Date(t.date))
    perDay.set(key, (perDay.get(key) ?? 0) + v)
  }

  const labels: string[] = []
  const values: number[] = []
  for (let d = 1; d <= days; d++) {
    const key = localDayKey(new Date(first.getFullYear(), first.getMonth(), d))
    labels.push(String(d))
    values.push(toYuan(perDay.get(key) ?? 0))
  }
  return { labels, values }
})

const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
  xAxis: {
    type: 'category',
    data: trend.value.labels,
    axisLine: { lineStyle: { color: INK.borderStrong } },
    axisLabel: { color: INK.textTertiary, fontSize: 11, interval: 4 },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: INK.border } },
    axisLabel: { color: INK.textTertiary, fontSize: 11 },
  },
  series: [
    {
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: INK.sage500 },
      areaStyle: { color: INK.sage50 },
      data: trend.value.values,
    },
  ],
}))
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">分析</h1>

    <!-- 實際花費 is the default; 總支出 is available for reconciling against a card statement. -->
    <div class="flex gap-2">
      <button
        v-for="b in (['actual', 'spent'] as const)"
        :key="b"
        class="h-7 rounded-sm px-3 transition-colors"
        :class="basis === b ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
        :style="{ font: 'var(--font-label)' }"
        @click="basis = b"
      >
        {{ b === 'actual' ? '實際花費' : '總支出' }}
      </button>
    </div>

    <AppCard title="分類占比">
      <template #action>
        <button
          class="text-sage-700"
          :style="{ font: 'var(--font-label)' }"
          @click="level = level === 'parent' ? 'leaf' : 'parent'"
        >
          {{ level === 'parent' ? '父分類' : '子分類' }}
        </button>
      </template>

      <p
        v-if="byCategory.length === 0"
        class="py-6 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        這個月還沒有支出
      </p>

      <template v-else>
        <EChart :option="donutOption" :height="200" />

        <ul class="mt-4 flex flex-col gap-2">
          <li
            v-for="(c, i) in byCategory.slice(0, 6)"
            :key="c.id"
            class="flex items-center gap-2"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-pill"
              :style="{ background: CHART_COLORS[i % CHART_COLORS.length] }"
            />
            <span class="flex-1 text-text" :style="{ font: 'var(--font-body)' }">{{ c.name }}</span>
            <span class="money text-text-secondary" :style="{ font: 'var(--font-caption)' }">
              {{ pctOf(c.cents) }}%
            </span>
            <MoneyText :cents="c.cents" size="strong" />
          </li>
        </ul>
      </template>
    </AppCard>

    <AppCard title="每日支出趨勢">
      <EChart :option="trendOption" :height="180" />
    </AppCard>

    <AppCard title="分帳統計">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">本月墊付</p>
          <MoneyText :cents="ledger.monthStats.fronted" size="strong" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">應收</p>
          <MoneyText :cents="ledger.balances.receivable" size="strong" class="!text-receivable" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">應付</p>
          <MoneyText :cents="ledger.balances.payable" size="strong" class="!text-payable" />
        </div>
      </div>
    </AppCard>
  </div>
</template>
