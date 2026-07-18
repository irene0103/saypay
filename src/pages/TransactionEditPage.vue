<script setup lang="ts">
/**
 * 新增 / 編輯記帳 — wireframe 1d, spec §3.2.
 *
 * Notable absences, both deliberate:
 *  - NO 帳戶 / 付款方式 field. Nothing depends on it — not the budget, not the split, not
 *    the debt matrix — so it is one more step between the user and a 3-second entry
 *    (decision #28). The wireframe still shows it; the spec removed it.
 *  - The split toggle is hidden entirely for income (spec §5.6).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Plus, Trash2, X } from '@lucide/vue'

import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import { useTransactionDraft } from '@/components/tx/useTransactionDraft'
import { evalAmountExpression, formatMoney } from '@/core/money'
import { MAX_MEMBERS } from '@/core/types'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ id?: string }>()

const ledger = useLedgerStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const { draft, splits, error, canSave, toTransaction, resetForNext, loadFrom } =
  useTransactionDraft(() => ledger.selfId)

/** Raw keypad text — supports `180+50` (spec §3.2.1). Kept separate from draft.amount. */
const amountInput = ref('')
watch(amountInput, (v) => {
  draft.value.amount = evalAmountExpression(v) ?? 0
})

/** Only leaf categories are selectable — transactions always hang off a leaf (spec §4.6). */
const leafCategories = computed(() => {
  const parentIds = new Set(ledger.liveCategories.map((c) => c.parentId).filter(Boolean))
  return ledger.liveCategories.filter((c) => !parentIds.has(c.id) && c.id !== 'c-income')
})

const others = computed(() => ledger.liveMembers.filter((m) => m.id !== ledger.selfId))

const memberById = computed(() => new Map(ledger.liveMembers.map((m) => [m.id, m])))
const shareFor = (id: string) => splits.value.find((s) => s.member === id)?.shareAmount ?? 0

const dateInput = computed({
  get: () => draft.value.date.slice(0, 10),
  set: (v: string) => {
    // Keep the clock time, move the day — the row belongs to its LOCAL day (spec §6.4).
    const [y, m, d] = v.split('-')
    const next = new Date(draft.value.date)
    next.setFullYear(Number(y), Number(m) - 1, Number(d))
    draft.value.date = next.toISOString()
  },
})

/** >6 participants: show the first five and collapse the rest (spec §3.2.1). */
const expandedMembers = ref(false)
const OVERFLOW_AT = 6
const visibleOthers = computed(() =>
  expandedMembers.value || others.value.length <= OVERFLOW_AT
    ? others.value
    : others.value.slice(0, 5),
)
const hiddenCount = computed(() => others.value.length - visibleOthers.value.length)

function toggleMember(id: string) {
  const list = draft.value.members
  const i = list.indexOf(id)
  if (i >= 0) {
    list.splice(i, 1)
  } else {
    if (list.length >= MAX_MEMBERS) return
    list.push(id)
  }
  syncValues()
}

// ---- Inline "add member" (the + in the participant picker) ----
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
    // Most likely a duplicate name (spec §4.2) — say why instead of silently failing.
    if (res.reason) toast.show(res.reason)
    return
  }
  draft.value.members.push(id)
  syncValues()
  newMemberName.value = ''
  addingMember.value = false
}

/** custom/percentage values are positional — keep them aligned with `members`. */
function syncValues() {
  const d = draft.value
  if (d.splitType === 'equal') return
  d.values = d.members.map((_, i) => d.values[i] ?? 0)
}
watch(() => draft.value.splitType, syncValues)

// Income cannot be split, so flipping to income must also clear the toggle (spec §5.6).
watch(
  () => draft.value.type,
  (t) => {
    if (t === 'income') draft.value.isSplit = false
  },
)

onMounted(() => {
  if (route.query.split === '1') draft.value.isSplit = true

  if (props.id) {
    const tx = ledger.liveTransactions.find((t) => t.id === props.id)
    if (tx) {
      loadFrom(tx)
      amountInput.value = String(Math.round(tx.amount / 100))
    }
  }
})

async function remove() {
  if (!props.id) return
  const tombstoned = await ledger.softDeleteTransaction(props.id)
  leave()
  // The delete is already durable in IndexedDB; the toast just offers a 5s escape hatch
  // before it's really gone from view (spec §3.12 L2).
  if (tombstoned) toast.show('已刪除', () => ledger.restoreTransaction(tombstoned.id))
}

/**
 * Go back, but land in the ledger rather than walking out of the app when this page was
 * opened directly (deep link, fresh tab) with no in-app history to pop.
 */
function leave() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'ledger' })
}

const existing = computed(() =>
  props.id ? ledger.liveTransactions.find((t) => t.id === props.id) : undefined,
)

async function save(andAnother = false) {
  if (!canSave.value) return
  await ledger.saveTransaction(toTransaction(ledger.selfId, existing.value))

  if (andAnother) {
    // 儲存並再記一筆: keep category/members/paidBy, clear the rest (spec §3.2.1).
    resetForNext()
    amountInput.value = ''
    return
  }
  leave()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex items-center justify-between">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="取消"
        @click="leave()"
      >
        <X :size="20" />
      </button>
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">
        {{ props.id ? '編輯記帳' : '新增記帳' }}
      </h1>
      <button class="btn-ghost !px-2 text-sage-700" :disabled="!canSave" @click="save()">
        儲存
      </button>
    </header>

    <!-- Type -->
    <div class="flex gap-1 rounded-md bg-surface-alt p-1">
      <button
        v-for="t in (['expense', 'income'] as const)"
        :key="t"
        class="h-9 flex-1 rounded-sm transition-colors"
        :class="draft.type === t ? 'bg-surface text-text shadow-sm' : 'text-text-secondary'"
        :style="{ font: 'var(--font-label)' }"
        @click="draft.type = t"
      >
        {{ t === 'expense' ? '支出' : '收入' }}
      </button>
    </div>

    <!-- Amount: the one input rendered as a display figure, not a field (design-system §5.4) -->
    <div class="flex flex-col items-center border-b border-border-strong pb-3">
      <div class="flex items-baseline gap-1">
        <span class="text-text-tertiary" :style="{ font: 'var(--font-display)' }">$</span>
        <input
          v-model="amountInput"
          class="money w-40 border-none bg-transparent text-left text-text outline-none"
          :style="{ font: 'var(--font-display)' }"
          placeholder="0"
          inputmode="text"
          aria-label="金額"
        />
      </div>
      <p
        v-if="amountInput && draft.amount > 0 && /[+\-*/×÷]/.test(amountInput)"
        class="mt-1 text-text-tertiary"
        :style="{ font: 'var(--font-caption)' }"
      >
        = {{ formatMoney(draft.amount) }}
      </p>
    </div>

    <!-- Title -->
    <label class="flex flex-col gap-1">
      <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">項目</span>
      <input v-model="draft.title" class="input" placeholder="火鍋聚餐" />
    </label>

    <!-- Category (leaves only) -->
    <div class="flex flex-col gap-2">
      <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">類別</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in leafCategories"
          :key="c.id"
          class="h-7 rounded-sm px-3 transition-colors"
          :class="
            draft.category === c.id
              ? 'bg-sage-100 text-sage-700'
              : 'bg-surface-alt text-text-secondary'
          "
          :style="{ font: 'var(--font-label)' }"
          @click="draft.category = c.id"
        >
          {{ c.name }}
        </button>
      </div>
    </div>

    <label class="flex flex-col gap-1">
      <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">日期</span>
      <input v-model="dateInput" type="date" class="input" />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">備註</span>
      <input v-model="draft.note" class="input" placeholder="選填" />
    </label>

    <!-- Split. Hidden outright for income — not disabled (spec §5.6). -->
    <template v-if="draft.type === 'expense'">
      <div class="flex items-center justify-between">
        <span class="text-text" :style="{ font: 'var(--font-body-strong)' }">是否分帳</span>
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

      <div v-if="draft.isSplit" class="flex flex-col gap-4 rounded-lg bg-sage-50 p-4">
        <!-- Payer: single, and not necessarily a participant (pure 代墊, spec §5.6) -->
        <div class="flex flex-col gap-2">
          <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">付款人</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="m in ledger.liveMembers"
              :key="m.id"
              class="flex items-center gap-1 rounded-pill p-1 pr-2 transition-colors"
              :class="draft.paidBy === m.id ? 'bg-sage-200' : 'bg-surface'"
              @click="draft.paidBy = m.id"
            >
              <MemberAvatar :member="m" :size="20" />
              <span :style="{ font: 'var(--font-caption)' }">{{ m.name }}</span>
            </button>
          </div>
        </div>

        <!-- Participants -->
        <div class="flex flex-col gap-2">
          <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">
            參與者（{{ draft.members.length }} / {{ MAX_MEMBERS }}）
          </span>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="m in [ledger.self, ...visibleOthers].filter(Boolean)"
              :key="m!.id"
              class="flex items-center gap-1 rounded-pill p-1 pr-2 transition-colors"
              :class="draft.members.includes(m!.id) ? 'bg-sage-200' : 'bg-surface'"
              @click="toggleMember(m!.id)"
            >
              <MemberAvatar :member="m!" :size="20" />
              <span :style="{ font: 'var(--font-caption)' }">{{ m!.name }}</span>
              <Check v-if="draft.members.includes(m!.id)" :size="14" class="text-sage-700" />
            </button>

            <button
              v-if="hiddenCount > 0"
              class="h-7 rounded-sm bg-surface-alt px-2 text-text-secondary"
              :style="{ font: 'var(--font-caption)' }"
              @click="expandedMembers = true"
            >
              +{{ hiddenCount }}
            </button>

            <!-- Inline name entry, or the + that opens it -->
            <input
              v-if="addingMember"
              v-model="newMemberName"
              class="input !h-7 w-28 !px-2"
              :style="{ font: 'var(--font-caption)' }"
              placeholder="新成員名稱"
              autofocus
              @keyup.enter="confirmNewMember"
              @blur="confirmNewMember"
            />
            <button
              v-else
              class="flex h-7 w-7 items-center justify-center rounded-pill bg-surface text-text-secondary disabled:opacity-40"
              :disabled="draft.members.length >= MAX_MEMBERS"
              :title="draft.members.length >= MAX_MEMBERS ? `單筆最多 ${MAX_MEMBERS} 人` : '新增成員'"
              aria-label="新增成員"
              @click="addingMember = true"
            >
              <Plus :size="16" />
            </button>
          </div>
        </div>

        <!-- Split mode -->
        <div class="flex flex-col gap-2">
          <span class="text-text-secondary" :style="{ font: 'var(--font-label)' }">分帳方式</span>
          <div class="flex gap-2">
            <button
              v-for="s in (['equal', 'custom', 'percentage'] as const)"
              :key="s"
              class="h-7 flex-1 rounded-sm transition-colors"
              :class="
                draft.splitType === s ? 'bg-sage-200 text-sage-900' : 'bg-surface text-text-secondary'
              "
              :style="{ font: 'var(--font-label)' }"
              @click="draft.splitType = s"
            >
              {{ s === 'equal' ? '平均' : s === 'custom' ? '指定金額' : '百分比' }}
            </button>
          </div>
        </div>

        <!-- Per-member values for custom / percentage -->
        <div v-if="draft.splitType !== 'equal'" class="flex flex-col gap-2">
          <div
            v-for="(id, i) in draft.members"
            :key="id"
            class="flex items-center gap-2"
          >
            <MemberAvatar v-if="memberById.get(id)" :member="memberById.get(id)!" :size="20" />
            <span class="flex-1" :style="{ font: 'var(--font-body)' }">
              {{ memberById.get(id)?.name }}
            </span>
            <input
              v-model.number="draft.values[i]"
              class="input money !h-9 w-24 text-right"
              type="number"
              :placeholder="draft.splitType === 'percentage' ? '%' : '$'"
            />
          </div>
        </div>

        <!-- Live preview (spec §3.2.1) -->
        <div class="border-t border-sage-200 pt-3">
          <p
            v-if="error"
            class="text-payable"
            :style="{ font: 'var(--font-caption)' }"
          >
            {{ error }}
          </p>
          <p
            v-else-if="splits.length"
            class="flex flex-wrap gap-x-2 text-text-secondary"
            :style="{ font: 'var(--font-caption)' }"
          >
            <span v-for="s in splits" :key="s.member">
              {{ memberById.get(s.member)?.name }}
              <MoneyText :cents="s.shareAmount" size="caption" />
              ·
            </span>
          </p>
        </div>
      </div>
    </template>

    <div class="flex gap-2">
      <button v-if="!props.id" class="btn-secondary flex-1" :disabled="!canSave" @click="save(true)">
        儲存並再記一筆
      </button>
      <button class="btn-primary flex-1" :disabled="!canSave" @click="save()">儲存</button>
    </div>

    <button v-if="props.id" class="btn-danger w-full" @click="remove">
      <Trash2 :size="18" /> 刪除這筆
    </button>
  </div>
</template>
