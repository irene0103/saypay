<script setup lang="ts">
/**
 * 分帳總覽 — wireframes 1g + 1h, spec §3.3.
 *
 * SINGLE SOURCE OF TRUTH: debt hangs off PEOPLE. A group is only a filter over
 * transactions — never its own ledger (spec §3.3). Every rule below follows from that:
 *
 *  - Settlement carries no groupId
 *  - a group card's net is the pairwise subtotal of its transactions, settlements NOT deducted
 *  - a group card never shows "未結清 N 筆" (it would contradict the 1g figure)
 *  - the 結清 entry point exists ONLY in 1g; tapping a person in 1h jumps to their 1g row
 *
 * 催收 does not exist — it was cut from the spec in favour of 分享 (§3.3.1).
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Share2, Plus } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import SplitDialog from '@/components/split/SplitDialog.vue'
import ConfirmDialog from '@/components/split/ConfirmDialog.vue'
import { buildDebtMap, net } from '@/core/debt'
import { formatMoney, evalAmountExpression } from '@/core/money'
import { useLedgerStore } from '@/stores/ledger'
import type { Cents, Member } from '@/core/types'

const ledger = useLedgerStore()
const route = useRoute()

const tab = ref<'people' | 'groups'>('people')

// Dashboard's owed/owing cards deep-link in with a direction already chosen (spec §3.1).
type Filter = 'all' | 'receivable' | 'payable'
const filter = ref<Filter>(
  (['receivable', 'payable'].includes(String(route.query.filter))
    ? route.query.filter
    : 'all') as Filter,
)

const memberById = computed(() => new Map(ledger.liveMembers.map((m) => [m.id, m])))

interface Row {
  member: Member
  net: Cents
  count: number
}

const rows = computed<Row[]>(() =>
  ledger.balances.perPerson.flatMap(({ member, net: n }) => {
    const m = memberById.value.get(member)
    if (!m) return []
    const count = ledger.liveTransactions.filter(
      (t) => t.isSplit && t.splits.some((s) => s.member === member),
    ).length
    return [{ member: m, net: n, count }]
  }),
)

const visibleRows = computed(() =>
  rows.value.filter((r) =>
    filter.value === 'receivable' ? r.net > 0 : filter.value === 'payable' ? r.net < 0 : true,
  ),
)

// ---- Groups (1h) ----
const groupCards = computed(() =>
  ledger.groups
    .filter((g) => !g.deletedAt)
    .map((g) => {
      const txs = ledger.liveTransactions.filter((t) => t.groupId === g.id)
      // Subtotal of THIS group's transactions only. Settlements are deliberately excluded:
      // they are not scoped to a group, so deducting them here would double-count against 1g.
      const groupDebt = buildDebtMap(txs, [])
      const subtotal = ledger.liveMembers.reduce(
        (sum, m) => (m.id === ledger.selfId ? sum : sum + net(groupDebt, m.id, ledger.selfId)),
        0,
      )
      return {
        group: g,
        subtotal,
        count: txs.length,
        members: g.memberIds.flatMap((id) => memberById.value.get(id) ?? []),
      }
    }),
)

// ---- Settle up (spec §3.3.3) ----
const settling = ref<Row | null>(null)
const settleInput = ref('')
const overpayWarning = ref<{ row: Row; amount: Cents } | null>(null)

function openSettle(row: Row) {
  settling.value = row
  // "全部結清" prefills the current pairwise net; the user may overwrite it for a partial.
  settleInput.value = String(Math.abs(Math.round(row.net / 100)))
}

const settleAmount = computed(() => evalAmountExpression(settleInput.value))

function submitSettle() {
  const row = settling.value
  const amount = settleAmount.value
  if (!row || !amount || amount <= 0) return

  // Settling MORE than owed is allowed, but it silently flips the balance — so say so
  // out loud before it happens (spec §3.3.3).
  if (amount > Math.abs(row.net)) {
    overpayWarning.value = { row, amount }
    return
  }
  commitSettle(row, amount)
}

function commitSettle(row: Row, amount: Cents) {
  // A settlement is an independent ledger entry — it NEVER edits the original transactions
  // (spec §3.3.3). Persisting it is the sync layer's job (Phase 3).
  const owesMe = row.net > 0
  // eslint-disable-next-line no-console
  console.log('[settle] TODO persist', {
    from: owesMe ? row.member.id : ledger.selfId,
    to: owesMe ? ledger.selfId : row.member.id,
    amount,
  })
  settling.value = null
  overpayWarning.value = null
  settleInput.value = ''
}

const overpayMessage = computed(() => {
  const w = overpayWarning.value
  if (!w) return ''
  const owed = Math.abs(w.row.net)
  const leftover = w.amount - owed
  return `${w.row.member.name} 只欠你 ${formatMoney(owed)}，確定收 ${formatMoney(w.amount)}？剩餘 ${formatMoney(leftover)} 將計為你欠 ${w.row.member.name}`
})

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'receivable', label: '應收' },
  { key: 'payable', label: '應付' },
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">分帳</h1>
      <button v-if="tab === 'groups'" class="btn-ghost !h-9 !px-2 text-sage-700">
        <Plus :size="18" /> 群組
      </button>
    </header>

    <!-- Three-up header: 應收 ｜ 淨額 ｜ 應付 (wireframe 1g) -->
    <AppCard>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">應收款</p>
          <MoneyText :cents="ledger.balances.receivable" size="strong" class="!text-receivable" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">淨額</p>
          <MoneyText :cents="ledger.balances.netTotal" tone="signed" size="display" />
        </div>
        <div>
          <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">應付款</p>
          <MoneyText :cents="ledger.balances.payable" size="strong" class="!text-payable" />
        </div>
      </div>
    </AppCard>

    <div class="flex gap-2">
      <button
        v-for="t in (['people', 'groups'] as const)"
        :key="t"
        class="h-7 rounded-sm px-3 transition-colors"
        :class="tab === t ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
        :style="{ font: 'var(--font-label)' }"
        @click="tab = t"
      >
        {{ t === 'people' ? '人員' : '群組' }}
      </button>
    </div>

    <!-- 1g people -->
    <template v-if="tab === 'people'">
      <div class="flex gap-2">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          class="h-7 rounded-sm px-3 transition-colors"
          :class="
            filter === f.key ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'
          "
          :style="{ font: 'var(--font-label)' }"
          @click="filter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <AppCard>
        <p
          v-if="visibleRows.length === 0"
          class="py-6 text-center text-text-tertiary"
          :style="{ font: 'var(--font-body)' }"
        >
          目前沒有未結清的款項
        </p>
        <div v-else class="divide-y divide-border">
          <div v-for="row in visibleRows" :key="row.member.id" class="flex items-center gap-3 py-3">
            <MemberAvatar :member="row.member" />

            <div class="min-w-0 flex-1">
              <p class="truncate text-text" :style="{ font: 'var(--font-body-strong)' }">
                {{ row.member.name }}
              </p>
              <!-- Truncates rather than wrapping at 320px. The direction is not lost when it
                   clips: the amount beside it is already dual-encoded with a sign and a
                   colour (design-system.md §5.7). -->
              <p class="truncate text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
                {{ row.net > 0 ? '他欠你' : '你欠他' }} · {{ row.count }} 筆記錄
              </p>
            </div>

            <MoneyText :cents="row.net" tone="signed" size="strong" class="shrink-0" />

            <button class="btn-secondary shrink-0 !h-8 !px-3" @click="openSettle(row)">
              結清
            </button>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
              aria-label="分享"
            >
              <Share2 :size="18" />
            </button>
          </div>
        </div>
      </AppCard>

      <button class="btn-ghost w-full">查看結清記錄</button>
    </template>

    <!-- 1h groups -->
    <template v-else>
      <div class="flex flex-col gap-3">
        <article v-for="g in groupCards" :key="g.group.id" class="card">
          <div class="flex items-start justify-between">
            <h2 class="text-text" :style="{ font: 'var(--font-h2)' }">{{ g.group.name }}</h2>
            <MoneyText :cents="g.subtotal" tone="signed" size="strong" />
          </div>
          <div class="mt-3 flex items-center gap-2">
            <MemberAvatar
              v-for="m in g.members"
              :key="m.id"
              :member="m"
              :size="20"
            />
            <span class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
              {{ g.count }} 筆記錄
            </span>
          </div>
        </article>

        <button class="btn-secondary w-full">
          <Plus :size="20" /> 建立群組（旅遊 / 聚餐 / 室友…）
        </button>
      </div>
    </template>

    <!-- Settle dialog -->
    <SplitDialog
      v-if="settling && !overpayWarning"
      :title="`與 ${settling.member.name} 結清`"
      @close="settling = null"
    >
      <p class="text-text-secondary" :style="{ font: 'var(--font-body)' }">
        目前
        {{ settling.net > 0 ? `${settling.member.name} 欠你` : `你欠 ${settling.member.name}` }}
        <MoneyText :cents="Math.abs(settling.net)" size="strong" />
      </p>

      <label class="mt-4 block">
        <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">結清金額</span>
        <input v-model="settleInput" class="input mt-1 w-full money" inputmode="decimal" />
      </label>

      <p
        v-if="settleInput && !settleAmount"
        class="mt-2 text-payable"
        :style="{ font: 'var(--font-caption)' }"
      >
        金額要大於 0 才能結清
      </p>

      <div class="mt-5 flex gap-2">
        <button class="btn-ghost flex-1" @click="settling = null">取消</button>
        <button class="btn-primary flex-1" :disabled="!settleAmount" @click="submitSettle">
          確認結清
        </button>
      </div>
    </SplitDialog>

    <ConfirmDialog
      v-if="overpayWarning"
      title="超額結清"
      :message="overpayMessage"
      confirm-text="確定"
      @close="overpayWarning = null"
      @confirm="commitSettle(overpayWarning.row, overpayWarning.amount)"
    />
  </div>
</template>
