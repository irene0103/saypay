<script setup lang="ts">
/**
 * 新增 / 編輯記帳 — reference layout 圖2 / 圖3.
 *
 * List-style form: each field is a row (icon + label left, value + chevron right); tapping
 * a row opens its picker inline below it. The amount is driven by an in-app NumberPad, not
 * a native keyboard — matching the design and avoiding iOS focus-zoom.
 *
 * Deliberately NO 帳戶 / 付款方式 row (spec decision #28): nothing depends on it and it
 * slows down entry. The split toggle is hidden for income (spec §5.6).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Check,
  Plus,
  Tag,
  Calendar,
  User,
  Users,
  Divide,
  FileText,
  FolderOpen,
  Trash2,
  X,
} from '@lucide/vue'

import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import FormRow from '@/components/tx/FormRow.vue'
import NumberPad from '@/components/tx/NumberPad.vue'
import { useTransactionDraft } from '@/components/tx/useTransactionDraft'
import { toCents } from '@/core/money'
import { MAX_MEMBERS, type Category } from '@/core/types'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ id?: string }>()

const ledger = useLedgerStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const { draft, splits, error, toTransaction, resetForNext, loadFrom } =
  useTransactionDraft(() => ledger.selfId)

// ---- Amount via the in-app keypad (decimal 元 string) ----
const amountStr = ref('')
watch(amountStr, (v) => {
  const n = parseFloat(v)
  draft.value.amount = v && Number.isFinite(n) ? toCents(n) : 0
})
const amountDisplay = computed(() => amountStr.value || '0')

// ---- Which row's picker is open; the keypad and pickers are mutually exclusive ----
type Row = 'category' | 'date' | 'note' | 'payer' | 'members' | 'split' | 'group'
const activeRow = ref<Row | null>(null)
const showKeypad = ref(true)

function openRow(row: Row) {
  activeRow.value = activeRow.value === row ? null : row
  showKeypad.value = false
}
function focusAmount() {
  activeRow.value = null
  showKeypad.value = true
}

// ---- Group (a view grouping for the transaction, spec §3.3.2 / §4.3) ----
const liveGroups = computed(() => ledger.groups.filter((g) => !g.deletedAt))
const selectedGroupName = computed(
  () => liveGroups.value.find((g) => g.id === draft.value.groupId)?.name ?? '',
)

// ---- Categories (leaves only; tapping + adds one, spec §4.6) ----
const leafCategories = computed(() => {
  const parentIds = new Set(ledger.liveCategories.map((c) => c.parentId).filter(Boolean))
  return ledger.liveCategories.filter((c) => !parentIds.has(c.id) && c.id !== 'c-income')
})
const selectedCategoryName = computed(
  () => ledger.categoryById.get(draft.value.category)?.name ?? '',
)

const addingCategory = ref(false)
const newCategoryName = ref('')
async function confirmNewCategory() {
  const name = newCategoryName.value.trim()
  if (!name) {
    addingCategory.value = false
    return
  }
  const id = crypto.randomUUID()
  await ledger.saveCategory({
    id,
    name,
    icon: 'circle-ellipsis',
    sortOrder: leafCategories.value.length + 1,
  } as Category)
  draft.value.category = id
  newCategoryName.value = ''
  addingCategory.value = false
}

// ---- Members ----
const others = computed(() => ledger.liveMembers.filter((m) => m.id !== ledger.selfId))
const memberById = computed(() => new Map(ledger.liveMembers.map((m) => [m.id, m])))
const shareFor = (id: string) => splits.value.find((s) => s.member === id)?.shareAmount ?? 0
const payerName = computed(() => memberById.value.get(draft.value.paidBy)?.name ?? '')
const participantMembers = computed(() =>
  draft.value.members.flatMap((id) => memberById.value.get(id) ?? []),
)

function toggleMember(id: string) {
  const list = draft.value.members
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else if (list.length < MAX_MEMBERS) list.push(id)
  syncValues()
}

const AVATAR_COLORS = ['#8A9C74', '#A9B58C', '#C7B98E', '#B08E6A', '#8FA0A0', '#C0A9A0']
const addingMember = ref(false)
const newMemberName = ref('')
async function confirmNewMember() {
  const name = newMemberName.value.trim()
  if (!name) {
    addingMember.value = false
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
  draft.value.members.push(id)
  syncValues()
  newMemberName.value = ''
  addingMember.value = false
}

// ---- Split mode ----
const SPLIT_LABELS = { equal: '平均分帳', custom: '指定金額', percentage: '百分比' } as const

function syncValues() {
  const d = draft.value
  if (d.splitType === 'equal') return
  d.values = d.members.map((_, i) => d.values[i] ?? 0)
}

/** Split 金額/百分比 can never be negative — clamp on input, and block the minus key so a
 *  leading "-" never even appears. */
function setSplitValue(i: number, raw: string) {
  const n = parseFloat(raw)
  draft.value.values[i] = Number.isFinite(n) && n > 0 ? n : 0
}
function blockNegativeKey(e: KeyboardEvent) {
  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') e.preventDefault()
}
// Switching mode resets the numbers: 元 and % aren't interchangeable, so a leftover
// "200" from 指定金額 would read as 200% under 百分比.
watch(
  () => draft.value.splitType,
  () => {
    draft.value.values = draft.value.members.map(() => 0)
  },
)
watch(
  () => draft.value.type,
  (t) => {
    if (t === 'income') draft.value.isSplit = false
  },
)

// ---- Date ----
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const dateLabel = computed(() => {
  const d = new Date(draft.value.date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`
})
const dateInput = computed({
  get: () => draft.value.date.slice(0, 10),
  set: (v: string) => {
    const [y, m, d] = v.split('-')
    const next = new Date(draft.value.date)
    next.setFullYear(Number(y), Number(m) - 1, Number(d))
    draft.value.date = next.toISOString()
  },
})

// The draft is created during setup, which can run before the store finishes loading — at
// which point selfId is '' and the default payer/participant is a blank id. Patch it in as
// soon as selfId resolves, so the UI shows 我 selected and the payer defaults correctly.
watch(
  () => ledger.selfId,
  (id) => {
    if (!id || props.id) return
    if (!draft.value.paidBy) draft.value.paidBy = id
    const blank = draft.value.members.indexOf('')
    if (blank >= 0) draft.value.members.splice(blank, 1, id)
    else if (draft.value.members.length === 0) draft.value.members = [id]
  },
  { immediate: true },
)

// ---- Load / save ----
onMounted(() => {
  if (route.query.split === '1') draft.value.isSplit = true
  if (props.id) {
    const tx = ledger.liveTransactions.find((t) => t.id === props.id)
    if (tx) {
      loadFrom(tx)
      amountStr.value = String(Math.round(tx.amount / 100))
    }
  }
})

const existing = computed(() =>
  props.id ? ledger.liveTransactions.find((t) => t.id === props.id) : undefined,
)

function leave() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'ledger' })
}

/**
 * Why this save can't go through, or null if it can. The 儲存 button stays enabled — the
 * user asked for a tappable button that explains the problem, not a greyed-out one — so
 * this drives a toast and opens the offending row on tap.
 */
function blockReason(): { message: string; row?: Row; amount?: boolean } | null {
  const d = draft.value
  if (d.amount <= 0) return { message: '請先輸入金額', amount: true }
  if (!d.category) return { message: '請選擇類別', row: 'category' }
  if (error.value) return { message: error.value, row: 'split' }
  return null
}

async function save(andAnother = false) {
  const blocked = blockReason()
  if (blocked) {
    toast.show(blocked.message)
    if (blocked.amount) focusAmount()
    else if (blocked.row) activeRow.value = blocked.row
    return
  }
  // No title row in this layout — fall back to the category name (spec keeps title required
  // in the model, so it must never be empty).
  if (!draft.value.title.trim()) draft.value.title = selectedCategoryName.value || '記帳'
  await ledger.saveTransaction(toTransaction(ledger.selfId, existing.value))
  if (andAnother) {
    resetForNext()
    amountStr.value = ''
    focusAmount()
    return
  }
  leave()
}

async function remove() {
  if (!props.id) return
  const tombstoned = await ledger.softDeleteTransaction(props.id)
  leave()
  if (tombstoned) toast.show('已刪除', () => ledger.restoreTransaction(tombstoned.id))
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <!-- Header -->
    <header class="flex items-center justify-between py-2">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="取消"
        @click="leave"
      >
        <X :size="22" />
      </button>
      <h1 class="text-text" :style="{ font: 'var(--font-h2)' }">
        {{ props.id ? '編輯記帳' : '新增記帳' }}
      </h1>
      <button
        class="px-2 text-sage-700"
        :style="{ font: 'var(--font-body-strong)' }"
        @click="save()"
      >
        儲存
      </button>
    </header>

    <!-- 支出 / 收入 underline tabs -->
    <div class="flex border-b border-border">
      <button
        v-for="t in (['expense', 'income'] as const)"
        :key="t"
        class="relative flex-1 pb-3 pt-1 transition-colors"
        :class="draft.type === t ? 'text-sage-700' : 'text-text-tertiary'"
        :style="{ font: 'var(--font-body-strong)' }"
        @click="draft.type = t"
      >
        {{ t === 'expense' ? '支出' : '收入' }}
        <span
          v-if="draft.type === t"
          class="absolute inset-x-6 bottom-0 h-0.5 rounded-pill bg-sage-700"
        />
      </button>
    </div>

    <!-- Amount display -->
    <button
      class="flex items-baseline justify-center gap-2 py-6 transition-colors"
      :class="showKeypad ? '' : 'opacity-90'"
      @click="focusAmount"
    >
      <span class="text-text-tertiary" :style="{ font: 'var(--font-display)' }">$</span>
      <span
        class="money"
        :class="amountStr ? 'text-text' : 'text-text-tertiary'"
        :style="{ font: 'var(--font-hero)' }"
        >{{ amountDisplay }}</span
      >
      <span
        v-if="showKeypad"
        class="ml-0.5 h-9 w-0.5 animate-pulse self-center bg-sage-500"
        aria-hidden="true"
      />
    </button>

    <!-- Field rows -->
    <div class="flex-1 divide-y divide-border border-t border-border">
      <!-- Split toggle (expense only, spec §5.6) -->
      <div v-if="draft.type === 'expense'" class="flex items-center gap-3 py-3.5">
        <Users :size="20" class="shrink-0 text-text-secondary" />
        <span class="text-text" :style="{ font: 'var(--font-body)' }">是否分帳</span>
        <span class="flex-1" />
        <button
          class="h-6 w-11 rounded-pill transition-colors"
          :class="draft.isSplit ? 'bg-sage-500' : 'bg-border-strong'"
          role="switch"
          :aria-checked="draft.isSplit"
          @click="draft.isSplit = !draft.isSplit"
        >
          <span
            class="block h-5 w-5 rounded-pill bg-white transition-transform"
            :class="draft.isSplit ? 'translate-x-5.5' : 'translate-x-0.5'"
          />
        </button>
      </div>

      <!-- Category -->
      <div>
        <FormRow :icon="Tag" label="類別" :active="activeRow === 'category'" @tap="openRow('category')">
          <span :class="selectedCategoryName ? 'text-text' : 'text-text-tertiary'">
            {{ selectedCategoryName || '選擇' }}
          </span>
        </FormRow>
        <div v-if="activeRow === 'category'" class="flex flex-wrap gap-2 pb-3">
          <button
            v-for="c in leafCategories"
            :key="c.id"
            class="h-9 rounded-md px-4 transition-colors"
            :class="draft.category === c.id ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
            :style="{ font: 'var(--font-body)' }"
            @click="draft.category = c.id"
          >
            {{ c.name }}
          </button>
          <input
            v-if="addingCategory"
            v-model="newCategoryName"
            class="input !h-9 w-32"
            placeholder="新類別名稱"
            autofocus
            @keyup.enter="confirmNewCategory"
            @blur="confirmNewCategory"
          />
          <button
            v-else
            class="flex h-9 items-center gap-1 rounded-md bg-surface-alt px-3 text-sage-700"
            :style="{ font: 'var(--font-body)' }"
            @click="addingCategory = true"
          >
            <Plus :size="16" /> 新增
          </button>
        </div>
      </div>

      <!-- Payer (split only) -->
      <div v-if="draft.isSplit && draft.type === 'expense'">
        <FormRow :icon="User" label="付款人" :active="activeRow === 'payer'" @tap="openRow('payer')">
          {{ payerName }}
        </FormRow>
        <div v-if="activeRow === 'payer'" class="flex flex-wrap gap-2 pb-3">
          <button
            v-for="m in ledger.liveMembers"
            :key="m.id"
            class="flex items-center gap-2 rounded-pill p-1.5 pr-3 transition-colors"
            :class="draft.paidBy === m.id ? 'bg-sage-200' : 'bg-surface-alt'"
            @click="draft.paidBy = m.id"
          >
            <MemberAvatar :member="m" :size="28" />
            <span :style="{ font: 'var(--font-body)' }">{{ m.name }}</span>
          </button>
        </div>
      </div>

      <!-- Participants (split only) -->
      <div v-if="draft.isSplit && draft.type === 'expense'">
        <FormRow :icon="Users" label="參與者" :active="activeRow === 'members'" @tap="openRow('members')">
          <span class="flex items-center -space-x-2">
            <MemberAvatar
              v-for="m in participantMembers.slice(0, 4)"
              :key="m.id"
              :member="m"
              :size="24"
            />
          </span>
          <span class="ml-1 text-text-secondary" :style="{ font: 'var(--font-caption)' }">
            {{ draft.members.length }} 人
          </span>
        </FormRow>
        <div v-if="activeRow === 'members'" class="flex flex-wrap items-center gap-2 pb-3">
          <button
            v-for="m in [ledger.self, ...others].filter(Boolean)"
            :key="m!.id"
            class="flex items-center gap-2 rounded-pill p-1.5 pr-3 transition-colors"
            :class="draft.members.includes(m!.id) ? 'bg-sage-200' : 'bg-surface-alt'"
            @click="toggleMember(m!.id)"
          >
            <MemberAvatar :member="m!" :size="28" />
            <span :style="{ font: 'var(--font-body)' }">{{ m!.name }}</span>
            <Check v-if="draft.members.includes(m!.id)" :size="16" class="text-sage-700" />
          </button>
          <input
            v-if="addingMember"
            v-model="newMemberName"
            class="input !h-9 w-32"
            placeholder="新成員名稱"
            autofocus
            @keyup.enter="confirmNewMember"
            @blur="confirmNewMember"
          />
          <button
            v-else
            class="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-alt text-text-secondary disabled:opacity-40"
            :disabled="draft.members.length >= MAX_MEMBERS"
            aria-label="新增成員"
            @click="addingMember = true"
          >
            <Plus :size="18" />
          </button>
        </div>
      </div>

      <!-- Split mode (split only) -->
      <div v-if="draft.isSplit && draft.type === 'expense'">
        <FormRow :icon="Divide" label="分帳方式" :active="activeRow === 'split'" @tap="openRow('split')">
          {{ SPLIT_LABELS[draft.splitType] }}
        </FormRow>
        <div v-if="activeRow === 'split'" class="flex flex-col gap-3 pb-3">
          <div class="flex gap-2">
            <button
              v-for="s in (['equal', 'custom', 'percentage'] as const)"
              :key="s"
              class="h-9 flex-1 rounded-md transition-colors"
              :class="draft.splitType === s ? 'bg-sage-200 text-sage-900' : 'bg-surface-alt text-text-secondary'"
              :style="{ font: 'var(--font-body)' }"
              @click="draft.splitType = s"
            >
              {{ SPLIT_LABELS[s] }}
            </button>
          </div>

          <div v-if="draft.splitType !== 'equal'" class="flex flex-col gap-2">
            <div v-for="(id, i) in draft.members" :key="id" class="flex items-center gap-2">
              <MemberAvatar v-if="memberById.get(id)" :member="memberById.get(id)!" :size="24" />
              <span class="flex-1" :style="{ font: 'var(--font-body)' }">
                {{ memberById.get(id)?.name }}
              </span>
              <input
                :value="draft.values[i] || ''"
                type="number"
                min="0"
                inputmode="decimal"
                class="input money !h-9 w-24 text-right"
                :placeholder="draft.splitType === 'percentage' ? '%' : '$'"
                @input="setSplitValue(i, ($event.target as HTMLInputElement).value)"
                @keydown="blockNegativeKey"
              />
            </div>
          </div>

          <p v-if="error" class="text-payable" :style="{ font: 'var(--font-caption)' }">{{ error }}</p>
          <p
            v-else-if="splits.length"
            class="flex flex-wrap gap-x-2 text-text-secondary"
            :style="{ font: 'var(--font-caption)' }"
          >
            <span v-for="s in splits" :key="s.member">
              {{ memberById.get(s.member)?.name }}
              <MoneyText :cents="s.shareAmount" size="caption" /> ·
            </span>
          </p>
        </div>
      </div>

      <!-- Date -->
      <div>
        <FormRow :icon="Calendar" label="日期" :active="activeRow === 'date'" @tap="openRow('date')">
          {{ dateLabel }}
        </FormRow>
        <div v-if="activeRow === 'date'" class="pb-3">
          <input v-model="dateInput" type="date" class="input w-full" />
        </div>
      </div>

      <!-- Note -->
      <div>
        <FormRow :icon="FileText" label="備註" :active="activeRow === 'note'" @tap="openRow('note')">
          <span :class="draft.note ? 'text-text' : 'text-text-tertiary'">
            {{ draft.note || '選填' }}
          </span>
        </FormRow>
        <div v-if="activeRow === 'note'" class="pb-3">
          <input v-model="draft.note" class="input w-full" placeholder="輸入備註" autofocus />
        </div>
      </div>

      <!-- Group (optional; a transaction belongs to at most one group, spec §4.3) -->
      <div v-if="liveGroups.length">
        <FormRow :icon="FolderOpen" label="群組" :active="activeRow === 'group'" @tap="openRow('group')">
          <span :class="selectedGroupName ? 'text-text' : 'text-text-tertiary'">
            {{ selectedGroupName || '無' }}
          </span>
        </FormRow>
        <div v-if="activeRow === 'group'" class="flex flex-wrap gap-2 pb-3">
          <button
            class="h-9 rounded-md px-4 transition-colors"
            :class="!draft.groupId ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
            :style="{ font: 'var(--font-body)' }"
            @click="draft.groupId = undefined"
          >
            無
          </button>
          <button
            v-for="g in liveGroups"
            :key="g.id"
            class="h-9 rounded-md px-4 transition-colors"
            :class="draft.groupId === g.id ? 'bg-sage-100 text-sage-700' : 'bg-surface-alt text-text-secondary'"
            :style="{ font: 'var(--font-body)' }"
            @click="draft.groupId = g.id"
          >
            {{ g.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom bar: the keypad (while entering the amount) sits above the action buttons. -->
    <div class="sticky bottom-0 -mx-4 bg-bg">
      <NumberPad v-if="showKeypad" v-model="amountStr" />
      <div class="flex flex-col gap-2 border-t border-border px-4 py-3">
        <div class="flex gap-2">
          <button v-if="!props.id" class="btn-secondary flex-1" @click="save(true)">
            儲存並再記一筆
          </button>
          <button class="btn-primary flex-1" @click="save()">儲存</button>
        </div>
        <button v-if="props.id" class="btn-danger w-full" @click="remove">
          <Trash2 :size="18" /> 刪除這筆
        </button>
      </div>
    </div>
  </div>
</template>
