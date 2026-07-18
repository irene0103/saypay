<script setup lang="ts">
/**
 * 成員管理 — spec §4.2, §3.6.
 *
 * Names are unique among non-deleted members (§4.2): a clash is blocked at entry with an
 * inline message, because the CSV export uses the name as a column header and two identical
 * avatars can't be told apart. A member carrying a balance can't be deleted (§3.6) — settle
 * first; "me" is never deletable.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, Plus, Trash2, X } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import MemberAvatar from '@/components/ui/MemberAvatar.vue'
import MoneyText from '@/components/ui/MoneyText.vue'
import { normalizeMemberName } from '@/schemas'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import type { Member } from '@/core/types'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

const AVATAR_COLORS = ['#8A9C74', '#A9B58C', '#C7B98E', '#B08E6A', '#8FA0A0', '#C0A9A0']

const members = computed(() =>
  [...ledger.liveMembers].sort((a, b) => Number(b.isSelf) - Number(a.isSelf)),
)

/** Live balance per member — drives the delete guard and the on-row amount. */
function net(id: string) {
  return ledger.netWith(id)
}

// ---- Add ----
const adding = ref(false)
const draftName = ref('')

/** Same normalized-uniqueness rule the store enforces, surfaced live as the user types. */
const addError = computed(() => {
  const name = normalizeMemberName(draftName.value)
  if (!name) return null
  const clash = ledger.liveMembers.some((m) => normalizeMemberName(m.name) === name)
  return clash ? `已有成員叫 ${name}` : null
})

async function commitAdd() {
  const name = draftName.value.trim()
  if (!name || addError.value) return
  const res = await ledger.saveMember({
    id: crypto.randomUUID(),
    name,
    avatarColor: AVATAR_COLORS[ledger.liveMembers.length % AVATAR_COLORS.length]!,
    isSelf: false,
  })
  if (!res.ok) {
    if (res.reason) toast.show(res.reason)
    return
  }
  adding.value = false
  draftName.value = ''
}

// ---- Rename ----
const editingId = ref<string | null>(null)
const editName = ref('')

function startRename(m: Member) {
  editingId.value = m.id
  editName.value = m.name
}

async function commitRename(m: Member) {
  const name = editName.value.trim()
  if (name && name !== m.name) {
    const res = await ledger.saveMember({ ...toPlain(m), name })
    if (!res.ok && res.reason) {
      toast.show(res.reason)
      return
    }
  }
  editingId.value = null
}

function toPlain(m: Member): Member {
  return { id: m.id, name: m.name, avatarColor: m.avatarColor, isSelf: m.isSelf }
}

// ---- Delete ----
async function remove(m: Member) {
  const res = await ledger.deleteMember(m.id)
  if (!res.ok && res.reason) toast.show(res.reason)
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
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">成員管理</h1>
    </header>

    <AppCard>
      <div class="divide-y divide-border">
        <div v-for="m in members" :key="m.id" class="flex items-center gap-3 py-3">
          <MemberAvatar :member="m" />

          <template v-if="editingId === m.id">
            <input
              v-model="editName"
              class="input h-9 flex-1"
              autofocus
              @keyup.enter="commitRename(m)"
            />
            <button class="text-sage-700" aria-label="完成" @click="commitRename(m)">
              <Check :size="18" />
            </button>
          </template>

          <template v-else>
            <button
              class="min-w-0 flex-1 text-left"
              :disabled="m.isSelf"
              @click="startRename(m)"
            >
              <span class="text-text" :style="{ font: 'var(--font-body-strong)' }">
                {{ m.name }}
              </span>
              <span
                v-if="m.isSelf"
                class="ml-2 text-text-tertiary"
                :style="{ font: 'var(--font-caption)' }"
                >（我）</span
              >
            </button>

            <MoneyText v-if="net(m.id) !== 0" :cents="net(m.id)" tone="signed" size="caption" />

            <button
              v-if="!m.isSelf"
              class="text-text-tertiary hover:text-payable"
              aria-label="刪除成員"
              @click="remove(m)"
            >
              <Trash2 :size="18" />
            </button>
          </template>
        </div>
      </div>
    </AppCard>

    <!-- Add -->
    <AppCard v-if="adding">
      <input
        v-model="draftName"
        class="input w-full"
        placeholder="成員名稱"
        autofocus
        @keyup.enter="commitAdd"
      />
      <p v-if="addError" class="mt-2 text-payable" :style="{ font: 'var(--font-caption)' }">
        {{ addError }}
      </p>
      <div class="mt-4 flex gap-2">
        <button class="btn-ghost flex-1" @click="adding = false">
          <X :size="16" /> 取消
        </button>
        <button
          class="btn-primary flex-1"
          :disabled="!draftName.trim() || !!addError"
          @click="commitAdd"
        >
          新增
        </button>
      </div>
    </AppCard>

    <button v-else class="btn-secondary w-full" @click="adding = true">
      <Plus :size="18" /> 新增成員
    </button>
  </div>
</template>
