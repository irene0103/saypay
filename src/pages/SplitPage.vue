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
import { useRoute, useRouter } from 'vue-router'
import { Share2, Plus, Trash2, Pencil } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import SplitDialog from '@/components/split/SplitDialog.vue'
import ConfirmDialog from '@/components/split/ConfirmDialog.vue'
import TransactionRow from '@/components/ledger/TransactionRow.vue'
import { buildDebtMap, net } from '@/core/debt'
import { formatMoney, evalAmountExpression } from '@/core/money'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import type { Cents, Member } from '@/core/types'

const ledger = useLedgerStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

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

async function commitSettle(row: Row, amount: Cents) {
  // A settlement is an independent ledger entry — it NEVER edits the original transactions
  // (spec §3.3.3). The from→to direction is who currently owes whom.
  const owesMe = row.net > 0
  await ledger.saveSettlement({
    id: crypto.randomUUID(),
    // ownerId is the account uid, not a memberId. Until anonymous auth lands (Phase 4),
    // inherit it from the existing ledger so all rows share one owner.
    ownerId: ledger.liveTransactions[0]?.ownerId ?? 'local',
    from: owesMe ? row.member.id : ledger.selfId,
    to: owesMe ? ledger.selfId : row.member.id,
    amount,
    at: new Date().toISOString(),
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

// ---- Settlement history (查看結清記錄) ----
const showHistory = ref(false)
const memberName = (id: string) =>
  ledger.liveMembers.find((m) => m.id === id)?.name ?? '（已刪除）'
const settlementHistory = computed(() =>
  [...ledger.liveSettlements].sort((a, b) => b.at.localeCompare(a.at)),
)

async function removeSettlement(id: string) {
  // A settlement can be deleted to undo a mistake, but never edited (spec §3.3.3).
  await ledger.softDeleteSettlement(id)
}

// ---- Create / edit group (spec §3.3.2) ----
const groupDialog = ref(false)
const groupName = ref('')
const groupMemberIds = ref<string[]>([])
/** null → creating; otherwise the id (and createdAt) of the group being edited. */
const editingGroup = ref<{ id: string; createdAt: string } | null>(null)

function openCreateGroup() {
  editingGroup.value = null
  groupName.value = ''
  groupMemberIds.value = ledger.selfId ? [ledger.selfId] : []
  addingGroupMember.value = false
  groupDialog.value = true
}

function openEditGroup(g: { id: string; name: string; memberIds: string[]; createdAt: string }) {
  editingGroup.value = { id: g.id, createdAt: g.createdAt }
  groupName.value = g.name
  groupMemberIds.value = [...g.memberIds]
  addingGroupMember.value = false
  groupDialog.value = true
}

function toggleGroupMember(id: string) {
  const i = groupMemberIds.value.indexOf(id)
  if (i >= 0) groupMemberIds.value.splice(i, 1)
  else groupMemberIds.value.push(id)
}

// Add a brand-new member from inside the group dialog, then include them in the group.
const AVATAR_COLORS = ['#8A9C74', '#A9B58C', '#C7B98E', '#B08E6A', '#8FA0A0', '#C0A9A0']
const addingGroupMember = ref(false)
const newGroupMemberName = ref('')
async function confirmNewGroupMember() {
  const name = newGroupMemberName.value.trim()
  if (!name) {
    addingGroupMember.value = false
    return
  }
  const id = crypto.randomUUID()
  const res = await ledger.saveMember({
    id,
    name,
    avatarColor: AVATAR_COLORS[ledger.liveMembers.length % AVATAR_COLORS.length]!,
    isSelf: false,
  })
  if (!res.ok) {
    if (res.reason) toast.show(res.reason)
    return
  }
  groupMemberIds.value.push(id)
  newGroupMemberName.value = ''
  addingGroupMember.value = false
}

async function commitGroup() {
  const name = groupName.value.trim()
  if (!name) return
  // Editing reuses the same id so saveGroup upserts; creating mints a new one.
  await ledger.saveGroup({
    id: editingGroup.value?.id ?? crypto.randomUUID(),
    name,
    memberIds: [...groupMemberIds.value],
    createdAt: editingGroup.value?.createdAt ?? new Date().toISOString(),
  })
  groupDialog.value = false
}

// Deleting keeps the group's transactions (their groupId is cleared, spec §3.6) — confirm first.
const deletingGroup = ref<{ id: string; name: string } | null>(null)
async function confirmDeleteGroup() {
  if (deletingGroup.value) await ledger.deleteGroup(deletingGroup.value.id)
  deletingGroup.value = null
}

// Tapping a group card opens its transaction list (spec §3.3.2 — the group is a view over
// its transactions).
const viewingGroup = ref<{ id: string; name: string } | null>(null)
const groupTransactions = computed(() =>
  viewingGroup.value
    ? ledger.liveTransactions
        .filter((t) => t.groupId === viewingGroup.value!.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : [],
)
function editFromGroup(id: string) {
  viewingGroup.value = null
  router.push({ name: 'tx-edit', params: { id } })
}

// ---- Share (spec §3.11 — backend RPC, Phase 5, not built) ----
function share() {
  toast.show('分享連結功能開發中')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">分帳</h1>
      <button
        v-if="tab === 'groups'"
        class="btn-ghost !h-9 !px-2 text-sage-700"
        @click="openCreateGroup"
      >
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
              @click="share"
            >
              <Share2 :size="18" />
            </button>
          </div>
        </div>
      </AppCard>

      <button class="btn-ghost w-full" @click="showHistory = true">查看結清記錄</button>
    </template>

    <!-- 1h groups -->
    <template v-else>
      <div class="flex flex-col gap-3">
        <article v-for="g in groupCards" :key="g.group.id" class="card">
          <div class="flex items-start justify-between gap-2">
            <h2 class="min-w-0 flex-1 truncate text-text" :style="{ font: 'var(--font-h2)' }">
              {{ g.group.name }}
            </h2>
            <MoneyText :cents="g.subtotal" tone="signed" size="strong" class="shrink-0" />
            <button
              class="shrink-0 text-text-tertiary hover:text-sage-700"
              aria-label="編輯群組"
              @click="openEditGroup(g.group)"
            >
              <Pencil :size="16" />
            </button>
            <button
              class="shrink-0 text-text-tertiary hover:text-payable"
              aria-label="刪除群組"
              @click="deletingGroup = { id: g.group.id, name: g.group.name }"
            >
              <Trash2 :size="16" />
            </button>
          </div>
          <button
            class="mt-3 flex w-full items-center gap-2 text-left"
            @click="viewingGroup = { id: g.group.id, name: g.group.name }"
          >
            <MemberAvatar v-for="m in g.members" :key="m.id" :member="m" :size="20" />
            <span class="flex-1 text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
              {{ g.count }} 筆記錄
            </span>
            <span class="text-sage-700" :style="{ font: 'var(--font-caption)' }">看明細 ›</span>
          </button>
        </article>

        <button class="btn-secondary w-full" @click="openCreateGroup">
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

    <!-- Settlement history -->
    <SplitDialog v-if="showHistory" title="結清記錄" @close="showHistory = false">
      <p
        v-if="settlementHistory.length === 0"
        class="py-6 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        還沒有結清記錄
      </p>
      <div v-else class="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
        <div v-for="s in settlementHistory" :key="s.id" class="flex items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-text" :style="{ font: 'var(--font-body)' }">
              {{ memberName(s.from) }} → {{ memberName(s.to) }}
            </p>
            <p class="text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
              {{ s.at.slice(0, 10) }}
            </p>
          </div>
          <MoneyText :cents="s.amount" size="strong" />
          <button
            class="text-text-tertiary hover:text-payable"
            aria-label="刪除結清記錄"
            @click="removeSettlement(s.id)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
    </SplitDialog>

    <!-- Create / edit group -->
    <SplitDialog
      v-if="groupDialog"
      :title="editingGroup ? '編輯群組' : '建立群組'"
      @close="groupDialog = false"
    >
      <input
        v-model="groupName"
        class="input w-full"
        placeholder="群組名稱（旅遊 / 聚餐 / 室友…）"
        autofocus
        @keyup.enter="commitGroup"
      />
      <p class="mt-4 text-text-secondary" :style="{ font: 'var(--font-label)' }">成員</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="m in ledger.liveMembers"
          :key="m.id"
          class="flex items-center gap-1 rounded-pill p-1 pr-2 transition-colors"
          :class="groupMemberIds.includes(m.id) ? 'bg-sage-200' : 'bg-surface-alt'"
          @click="toggleGroupMember(m.id)"
        >
          <MemberAvatar :member="m" :size="20" />
          <span :style="{ font: 'var(--font-caption)' }">{{ m.name }}</span>
        </button>

        <input
          v-if="addingGroupMember"
          v-model="newGroupMemberName"
          class="input !h-8 w-28"
          placeholder="新成員名稱"
          autofocus
          @keyup.enter="confirmNewGroupMember"
          @blur="confirmNewGroupMember"
        />
        <button
          v-else
          class="flex h-8 items-center gap-1 rounded-pill bg-surface-alt px-3 text-sage-700"
          :style="{ font: 'var(--font-caption)' }"
          @click="addingGroupMember = true"
        >
          <Plus :size="14" /> 新增成員
        </button>
      </div>
      <div class="mt-5 flex gap-2">
        <button class="btn-ghost flex-1" @click="groupDialog = false">取消</button>
        <button class="btn-primary flex-1" :disabled="!groupName.trim()" @click="commitGroup">
          {{ editingGroup ? '儲存' : '建立' }}
        </button>
      </div>
    </SplitDialog>

    <ConfirmDialog
      v-if="deletingGroup"
      title="刪除群組"
      :message="`確定刪除「${deletingGroup.name}」？群組內的記錄會保留，只是不再歸到這個群組。`"
      confirm-text="刪除"
      danger
      @close="deletingGroup = null"
      @confirm="confirmDeleteGroup"
    />

    <!-- Group detail: the group's transactions -->
    <SplitDialog v-if="viewingGroup" :title="viewingGroup.name" @close="viewingGroup = null">
      <p
        v-if="groupTransactions.length === 0"
        class="py-6 text-center text-text-tertiary"
        :style="{ font: 'var(--font-body)' }"
      >
        這個群組還沒有記錄
      </p>
      <div v-else class="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
        <button
          v-for="t in groupTransactions"
          :key="t.id"
          class="block w-full text-left"
          @click="editFromGroup(t.id)"
        >
          <TransactionRow :tx="t" />
        </button>
      </div>
    </SplitDialog>
  </div>
</template>
