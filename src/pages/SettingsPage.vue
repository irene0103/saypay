<script setup lang="ts">
/**
 * 設定 — wireframe 1k, spec §3.6.
 *
 * Note there is no 帳戶管理 row: the account / payment-method concept was removed from the
 * spec entirely (decision #28), so the wireframe's row is stale.
 */
import { computed, ref } from 'vue'
import {
  ChevronRight,
  Database,
  Download,
  Link2,
  Users,
  Tag,
  Wallet,
  Bell,
  Lock,
  Trash2,
  Info,
} from '@lucide/vue'

import { useRouter } from 'vue-router'

import AppCard from '@/components/ui/AppCard.vue'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import {
  buildSettlementsCsv,
  buildTransactionsCsv,
  download,
  exportJson,
  withBom,
} from '@/lib/export'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 11) return '早安 · 今天也要好好記帳喔'
  if (h < 18) return '午安 · 今天也要好好記帳喔'
  return '晚安 · 今天也要好好記帳喔'
})

const hideAmounts = ref(false)
const reminderOn = ref(true)
const reminderAt = ref('21:00')

const SECTIONS = [
  {
    title: '管理',
    items: [
      { icon: Users, label: '成員管理', to: 'members' },
      { icon: Tag, label: '類別管理', to: 'categories' },
      { icon: Wallet, label: '預算管理', to: 'budget-edit' },
      { icon: Link2, label: '分享連結管理' },
    ],
  },
  {
    title: '資料安全',
    items: [
      { icon: Database, label: '備份與還原' },
      { icon: Trash2, label: '垃圾桶' },
    ],
  },
  {
    title: '帳號',
    items: [
      { icon: Lock, label: '綁定 Google / Apple' },
      { icon: Info, label: '關於分分帳' },
    ],
  },
] as const

async function doExportJson() {
  download('saypay-backup.json', await exportJson(), 'application/json')
}

function doExportCsv() {
  const csv = buildTransactionsCsv(ledger.transactions, ledger.members, (id) =>
    ledger.categoryById.get(id)?.name ?? id,
  )
  // BOM, or Excel renders every Chinese title as mojibake (spec §3.12 L4).
  download('saypay-transactions.csv', withBom(csv), 'text/csv;charset=utf-8')
}

function doExportSettlements() {
  const csv = buildSettlementsCsv(
    ledger.settlements,
    (id) => ledger.members.find((m) => m.id === id)?.name ?? id,
  )
  download('saypay-settlements.csv', withBom(csv), 'text/csv;charset=utf-8')
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">設定</h1>

    <AppCard hero>
      <p class="text-sage-900" :style="{ font: 'var(--font-h2)' }">{{ greeting }}</p>
      <p class="mt-1 text-text-secondary" :style="{ font: 'var(--font-caption)' }">分分帳 SayPay</p>
    </AppCard>

    <!-- Export sits at the top of its own card, not buried: it is the last line of defence
         against every other kind of data loss (spec §3.12 L4). -->
    <AppCard title="匯出資料">
      <div class="flex flex-col gap-2">
        <button class="btn-secondary w-full justify-start" @click="doExportJson">
          <Download :size="18" /> 匯出 JSON（完整備份，可還原）
        </button>
        <button class="btn-secondary w-full justify-start" @click="doExportCsv">
          <Download :size="18" /> 匯出 CSV（交易明細）
        </button>
        <button class="btn-secondary w-full justify-start" @click="doExportSettlements">
          <Download :size="18" /> 匯出 CSV（結清記錄）
        </button>
      </div>
    </AppCard>

    <AppCard title="記帳提醒">
      <div class="flex items-center justify-between">
        <span class="text-text" :style="{ font: 'var(--font-body)' }">每日提醒</span>
        <button
          class="h-6 w-11 rounded-pill transition-colors"
          :class="reminderOn ? 'bg-sage-500' : 'bg-border-strong'"
          role="switch"
          :aria-checked="reminderOn"
          @click="reminderOn = !reminderOn"
        >
          <span
            class="block h-5 w-5 rounded-pill bg-white transition-transform"
            :class="reminderOn ? 'translate-x-5.5' : 'translate-x-0.5'"
          />
        </button>
      </div>
      <div v-if="reminderOn" class="mt-3 flex items-center justify-between">
        <span class="text-text-secondary" :style="{ font: 'var(--font-body)' }">提醒時間</span>
        <input v-model="reminderAt" type="time" class="input !h-9 w-32" />
      </div>
    </AppCard>

    <AppCard title="隱私">
      <div class="flex items-center justify-between">
        <span class="text-text" :style="{ font: 'var(--font-body)' }">首頁隱藏金額</span>
        <button
          class="h-6 w-11 rounded-pill transition-colors"
          :class="hideAmounts ? 'bg-sage-500' : 'bg-border-strong'"
          role="switch"
          :aria-checked="hideAmounts"
          @click="hideAmounts = !hideAmounts"
        >
          <span
            class="block h-5 w-5 rounded-pill bg-white transition-transform"
            :class="hideAmounts ? 'translate-x-5.5' : 'translate-x-0.5'"
          />
        </button>
      </div>
    </AppCard>

    <AppCard v-for="section in SECTIONS" :key="section.title" :title="section.title">
      <div class="divide-y divide-border">
        <button
          v-for="item in section.items"
          :key="item.label"
          class="flex w-full items-center gap-3 py-3 text-left hover:bg-surface-alt"
          @click="'to' in item && item.to ? router.push({ name: item.to }) : undefined"
        >
          <component :is="item.icon" :size="20" class="text-text-secondary" />
          <span class="flex-1 text-text" :style="{ font: 'var(--font-body)' }">
            {{ item.label }}
          </span>
          <ChevronRight :size="18" class="text-text-tertiary" />
        </button>
      </div>
    </AppCard>

    <!-- Anonymous-account limits are disclosed, not hidden (spec §3.12 L0). -->
    <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
      目前使用匿名帳號。綁定帳號後，換手機也能取回資料。
    </p>

    <button class="btn-danger w-full" @click="toast.show('帳號功能需先綁定登入（開發中）')">
      <Trash2 :size="18" /> 刪除帳號
    </button>
  </div>
</template>
