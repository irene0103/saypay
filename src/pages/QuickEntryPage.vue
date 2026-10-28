<script setup lang="ts">
/**
 * 說一筆 — natural-language / voice entry, spec §3.2.2 (1e) + §3.7 (1l).
 *
 * Say or type 「昨天吃火鍋300元、今天早餐茶葉蛋30元」 and every amount becomes a parsed card.
 * Iron rule (§3.2.2): a parse is NEVER saved on its own — the user confirms with 儲存.
 * Guessed fields carry a dashed underline; 改用表單 hands the card's draft to the 1d form
 * unchanged, because both are renderings of the same TransactionDraft (§3.2).
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Mic, MicOff, X, Trash2, SquarePen } from '@lucide/vue'

import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import {
  emptyDraft,
  handOffDraft,
  useTransactionDraft,
  type TransactionDraft,
} from '@/components/tx/useTransactionDraft'
import { useSpeechInput } from '@/components/tx/useSpeechInput'
import { guessCategory, parseEntries, type ParsedEntry } from '@/core/nlParse'
import { toCents } from '@/core/money'
import { MAX_MEMBERS } from '@/core/types'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

const text = ref('')

// ---- Voice: what's heard is appended to whatever was already typed ----
let typedBeforeListening = ''
const speech = useSpeechInput((heard) => {
  text.value = typedBeforeListening ? `${typedBeforeListening} ${heard}` : heard
})
function toggleMic() {
  if (speech.listening.value) return speech.stop()
  typedBeforeListening = text.value.trim()
  speech.start()
}

// ---- Parse → cards ----
interface Card {
  key: number
  source: string
  draft: TransactionDraft
}
const cards = ref<Card[]>([])
let nextKey = 0

const memberById = computed(() => new Map(ledger.liveMembers.map((m) => [m.id, m])))
const leafCategories = computed(() => {
  const parentIds = new Set(ledger.liveCategories.map((c) => c.parentId).filter(Boolean))
  return ledger.liveCategories.filter((c) => !parentIds.has(c.id))
})

function toCard(p: ParsedEntry): Card {
  const self = ledger.selfId
  const cat = guessCategory(p, ledger.liveCategories, ledger.liveTransactions)
  const isSplit = p.type === 'expense' && p.memberIds.length > 0
  const inferred = new Set<keyof TransactionDraft>()
  if (p.dateInferred) inferred.add('date')
  if (!cat || cat.inferred) inferred.add('category')
  if (isSplit) {
    inferred.add('splitType')
    if (!p.paidBy) inferred.add('paidBy')
  }
  return {
    key: nextKey++,
    source: p.source,
    draft: {
      ...emptyDraft(self),
      title: p.title,
      amount: p.amount,
      type: p.type,
      category: cat?.id ?? '',
      date: p.date.toISOString(),
      isSplit,
      paidBy: p.paidBy ?? self,
      members: isSplit ? [self, ...p.memberIds].slice(0, MAX_MEMBERS) : [self],
      inferred,
    },
  }
}

// Re-parse as the sentence changes. Card edits made afterwards stick until the text changes.
// Also once the store finishes loading: on a cold start the first words can arrive before
// the categories and members they're matched against.
watch([text, () => ledger.loaded], ([t]) => {
  cards.value = parseEntries(t, {
    today: new Date(),
    selfId: ledger.selfId,
    members: ledger.liveMembers
      .filter((m) => m.id !== ledger.selfId)
      .map((m) => ({ id: m.id, name: m.name })),
  }).map(toCard)
})

const noAmount = computed(() => text.value.trim() !== '' && cards.value.length === 0)

// ---- Card editing. Touching a guessed field makes it the user's, so drop the dashes. ----
function confirmField(card: Card, field: keyof TransactionDraft) {
  card.draft.inferred.delete(field)
}
function setAmount(card: Card, raw: string) {
  const n = parseFloat(raw)
  card.draft.amount = Number.isFinite(n) && n > 0 ? toCents(n) : 0
}
function setDate(card: Card, v: string) {
  const [y, m, d] = v.split('-')
  const next = new Date(card.draft.date)
  next.setFullYear(Number(y), Number(m) - 1, Number(d))
  card.draft.date = next.toISOString()
  confirmField(card, 'date')
}
const dateValue = (card: Card) => {
  const d = new Date(card.draft.date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function removeCard(key: number) {
  cards.value = cards.value.filter((c) => c.key !== key)
}

function splitLabel(card: Card): string {
  const others = card.draft.members
    .filter((id) => id !== ledger.selfId)
    .map((id) => memberById.value.get(id)?.name ?? '')
  return `與 ${others.join('、')} 平分`
}
const payerName = (card: Card) =>
  card.draft.paidBy === ledger.selfId ? '我' : (memberById.value.get(card.draft.paidBy)?.name ?? '')

// ---- Leave / switch to the form ----
function leave() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'dashboard' })
}

function openInForm(card?: Card) {
  // No amount found → the form gets the raw sentence in 備註 (spec §3.2.2).
  handOffDraft(card?.draft ?? { ...emptyDraft(ledger.selfId), note: text.value.trim() })
  router.replace({ name: 'tx-new' })
}

// ---- Save: validate every card first, then write them all ----
async function saveAll() {
  if (cards.value.length === 0) return
  const rows = []
  for (const [i, card] of cards.value.entries()) {
    const { draft, canSave, error, toTransaction } = useTransactionDraft(() => ledger.selfId)
    draft.value = card.draft
    if (!draft.value.title.trim()) {
      draft.value.title = ledger.categoryById.get(draft.value.category)?.name ?? '記帳'
    }
    if (!canSave.value) {
      toast.show(`第 ${i + 1} 筆：${error.value ?? (draft.value.amount > 0 ? '請選擇類別' : '請輸入金額')}`)
      return
    }
    rows.push(toTransaction(ledger.selfId))
  }
  for (const tx of rows) await ledger.saveTransaction(tx)
  toast.show(`已記 ${rows.length} 筆`)
  leave()
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="flex items-center justify-between py-2">
      <button
        class="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-alt"
        aria-label="取消"
        @click="leave"
      >
        <X :size="22" />
      </button>
      <h1 class="text-text" :style="{ font: 'var(--font-h2)' }">說一筆</h1>
      <button
        class="px-2 text-sage-700"
        :style="{ font: 'var(--font-body-strong)' }"
        @click="openInForm()"
      >
        表單
      </button>
    </header>

    <!-- The sentence. Typing works everywhere; on iPhone the keyboard's own 🎤 is the most
         reliable way to dictate into it. -->
    <textarea
      v-model="text"
      class="input mt-2 !h-28 w-full resize-none py-2.5"
      placeholder="例：昨天吃火鍋300元、今天早餐茶葉蛋30元、上禮拜三蛋餅50元"
    />

    <div class="mt-3 flex flex-col items-center gap-2">
      <button
        v-if="speech.supported"
        class="flex h-16 w-16 items-center justify-center rounded-pill text-white transition-colors disabled:bg-border-strong"
        :class="speech.listening.value ? 'animate-pulse bg-payable' : 'bg-sage-500 shadow-fab'"
        :disabled="speech.offline.value"
        :aria-label="speech.listening.value ? '停止' : '開始說話'"
        @click="toggleMic"
      >
        <MicOff v-if="speech.offline.value" :size="26" />
        <Mic v-else :size="26" />
      </button>
      <p class="text-center text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
        <template v-if="speech.error.value">{{ speech.error.value }}</template>
        <template v-else-if="speech.offline.value">語音需要網路連線，可以直接打字</template>
        <template v-else-if="speech.listening.value">正在聽…說完再按一次</template>
        <template v-else-if="speech.supported">按麥克風開始說，或直接打字</template>
        <template v-else>點上面的輸入框，用鍵盤上的 🎤 聽寫</template>
      </p>
    </div>

    <!-- Parsed cards -->
    <div class="mt-4 flex flex-1 flex-col gap-3">
      <div v-if="noAmount" class="card text-center">
        <p class="text-text-secondary" :style="{ font: 'var(--font-body)' }">找不到金額</p>
        <button class="btn-secondary mt-3" @click="openInForm()">改用表單填寫</button>
      </div>

      <article v-for="card in cards" :key="card.key" class="card flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input
            v-model="card.draft.title"
            class="input !h-9 min-w-0 flex-1"
            placeholder="名稱（選填）"
          />
          <span class="text-text-tertiary">$</span>
          <input
            :value="card.draft.amount / 100"
            type="number"
            min="0"
            inputmode="decimal"
            class="input money !h-9 w-24 text-right"
            :class="card.draft.type === 'income' ? 'text-receivable' : ''"
            @input="setAmount(card, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2" :style="{ font: 'var(--font-caption)' }">
          <span
            v-if="card.draft.type === 'income'"
            class="rounded-sm bg-sage-100 px-2 py-0.5 text-sage-700"
          >
            收入
          </span>
          <input
            :value="dateValue(card)"
            type="date"
            class="h-8 rounded-sm bg-surface-alt px-2 text-text-secondary"
            :class="card.draft.inferred.has('date') ? 'inferred' : ''"
            @change="setDate(card, ($event.target as HTMLInputElement).value)"
          />
          <select
            v-model="card.draft.category"
            class="h-8 rounded-sm bg-surface-alt px-2 text-text-secondary"
            :class="card.draft.inferred.has('category') ? 'inferred' : ''"
            @change="confirmField(card, 'category')"
          >
            <option value="" disabled>選擇類別</option>
            <option v-for="c in leafCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div
          v-if="card.draft.isSplit"
          class="flex items-center gap-2 text-text-secondary"
          :style="{ font: 'var(--font-caption)' }"
        >
          <span class="flex -space-x-1.5">
            <template v-for="id in card.draft.members" :key="id">
              <MemberAvatar v-if="memberById.get(id)" :member="memberById.get(id)!" :size="20" />
            </template>
          </span>
          <span :class="card.draft.inferred.has('splitType') ? 'inferred' : ''">
            {{ splitLabel(card) }}
          </span>
          ·
          <span :class="card.draft.inferred.has('paidBy') ? 'inferred' : ''">
            {{ payerName(card) }} 付
          </span>
        </div>

        <div class="flex items-center justify-between border-t border-border pt-2">
          <span class="truncate text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
            「{{ card.source }}」
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <button
              class="flex h-8 items-center gap-1 rounded-md px-2 text-sage-700 hover:bg-surface-alt"
              :style="{ font: 'var(--font-caption)' }"
              @click="openInForm(card)"
            >
              <SquarePen :size="15" /> 改用表單
            </button>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:text-payable"
              aria-label="移除這筆"
              @click="removeCard(card.key)"
            >
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </article>

      <p
        v-if="cards.length"
        class="text-center text-text-tertiary"
        :style="{ font: 'var(--font-caption)' }"
      >
        虛線是猜的，請確認。修改上面的句子會重新解析。
      </p>
    </div>

    <!-- Nothing is saved until this is tapped (spec §3.2.2 鐵則). -->
    <div
      class="sticky bottom-0 -mx-4 mt-4 border-t border-border bg-bg px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]"
    >
      <button class="btn-primary w-full !h-12" :disabled="cards.length === 0" @click="saveAll">
        {{ cards.length ? `儲存 ${cards.length} 筆` : '儲存' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Fields the parser guessed rather than read (spec §3.2.2). */
/* A border rather than text-decoration: <select> and date inputs ignore the latter. */
.inferred {
  border-bottom: 1.5px dashed currentColor;
}
</style>
