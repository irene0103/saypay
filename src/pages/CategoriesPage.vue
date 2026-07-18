<script setup lang="ts">
/**
 * 類別管理 — spec §4.6.
 *
 * Two levels only: a parent may hold children, a child may not (parentId can't itself have
 * a parentId). Transactions hang off leaves, so the picker on the entry form only offers
 * leaf categories — this screen is where the tree is shaped.
 *
 * Deletes are soft when anything references the category (spec §3.6): a removed category
 * stops appearing for new transactions but stays visible on the ones that already used it.
 */
import { computed, ref } from 'vue'
import { ArrowLeft, Check, ChevronRight, Plus, Trash2, X } from '@lucide/vue'

import AppCard from '@/components/ui/AppCard.vue'
import CategoryIcon from '@/components/ledger/CategoryIcon.vue'
import { useLedgerStore } from '@/stores/ledger'
import { useToastStore } from '@/stores/toast'
import { useRouter } from 'vue-router'
import type { Category } from '@/core/types'

const ledger = useLedgerStore()
const toast = useToastStore()
const router = useRouter()

/** Parents, each with its live children — the two-level shape the spec allows. */
const tree = computed(() => {
  const parents = ledger.liveCategories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return parents.map((p) => ({
    parent: p,
    children: ledger.liveCategories
      .filter((c) => c.parentId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
})

const DEFAULT_ICON = 'circle-ellipsis'
const ICON_CHOICES = [
  'utensils',
  'bus',
  'gamepad-2',
  'shopping-bag',
  'house',
  'shopping-basket',
  'train-front',
  'clapperboard',
  'wallet',
  DEFAULT_ICON,
]

// ---- Add (a parent, or a child under a given parent) ----
const adding = ref<{ parentId?: string } | null>(null)
const draftName = ref('')
const draftIcon = ref<string>(DEFAULT_ICON)

function startAdd(parentId?: string) {
  adding.value = { parentId }
  draftName.value = ''
  draftIcon.value = ICON_CHOICES[0] ?? DEFAULT_ICON
}

function nextSortOrder(parentId?: string): number {
  const siblings = ledger.liveCategories.filter((c) => (c.parentId ?? undefined) === parentId)
  return siblings.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1
}

async function commitAdd() {
  const name = draftName.value.trim()
  if (!name) return
  const cat: Category = {
    id: crypto.randomUUID(),
    name,
    // A child inherits its parent's glyph unless the parent had none.
    icon: adding.value?.parentId
      ? (ledger.categoryById.get(adding.value.parentId)?.icon ?? draftIcon.value)
      : draftIcon.value,
    parentId: adding.value?.parentId,
    sortOrder: nextSortOrder(adding.value?.parentId),
  }
  await ledger.saveCategory(cat)
  adding.value = null
}

// ---- Rename ----
const editingId = ref<string | null>(null)
const editName = ref('')

function startRename(cat: Category) {
  editingId.value = cat.id
  editName.value = cat.name
}

async function commitRename(cat: Category) {
  const name = editName.value.trim()
  if (name && name !== cat.name) {
    await ledger.saveCategory({ ...toPlainCategory(cat), name })
  }
  editingId.value = null
}

function toPlainCategory(cat: Category): Category {
  return {
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    parentId: cat.parentId,
    sortOrder: cat.sortOrder,
  }
}

// ---- Delete ----
async function remove(id: string) {
  const res = await ledger.deleteCategory(id)
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
      <h1 class="text-text" :style="{ font: 'var(--font-h1)' }">類別管理</h1>
    </header>

    <AppCard v-for="node in tree" :key="node.parent.id">
      <!-- Parent row -->
      <div class="flex items-center gap-3">
        <CategoryIcon :category-id="node.parent.id" />

        <template v-if="editingId === node.parent.id">
          <input
            v-model="editName"
            class="input h-9 flex-1"
            autofocus
            @keyup.enter="commitRename(node.parent)"
          />
          <button class="text-sage-700" aria-label="完成" @click="commitRename(node.parent)">
            <Check :size="18" />
          </button>
        </template>
        <template v-else>
          <button
            class="flex-1 text-left text-text"
            :style="{ font: 'var(--font-body-strong)' }"
            @click="startRename(node.parent)"
          >
            {{ node.parent.name }}
          </button>
          <button
            class="text-text-tertiary hover:text-payable"
            aria-label="刪除分類"
            @click="remove(node.parent.id)"
          >
            <Trash2 :size="18" />
          </button>
        </template>
      </div>

      <!-- Children -->
      <div class="mt-2 flex flex-col gap-1 border-l border-border pl-4">
        <div
          v-for="child in node.children"
          :key="child.id"
          class="flex items-center gap-2 py-1"
        >
          <ChevronRight :size="14" class="text-text-tertiary" />
          <template v-if="editingId === child.id">
            <input
              v-model="editName"
              class="input h-8 flex-1"
              autofocus
              @keyup.enter="commitRename(child)"
            />
            <button class="text-sage-700" aria-label="完成" @click="commitRename(child)">
              <Check :size="16" />
            </button>
          </template>
          <template v-else>
            <button
              class="flex-1 text-left text-text"
              :style="{ font: 'var(--font-body)' }"
              @click="startRename(child)"
            >
              {{ child.name }}
            </button>
            <button
              class="text-text-tertiary hover:text-payable"
              aria-label="刪除子分類"
              @click="remove(child.id)"
            >
              <Trash2 :size="16" />
            </button>
          </template>
        </div>

        <!-- Add child -->
        <div v-if="adding?.parentId === node.parent.id" class="flex items-center gap-2 py-1">
          <input
            v-model="draftName"
            class="input h-8 flex-1"
            placeholder="子分類名稱"
            autofocus
            @keyup.enter="commitAdd"
          />
          <button class="text-sage-700" aria-label="新增" @click="commitAdd">
            <Check :size="16" />
          </button>
          <button class="text-text-tertiary" aria-label="取消" @click="adding = null">
            <X :size="16" />
          </button>
        </div>
        <button
          v-else
          class="flex items-center gap-1 py-1 text-sage-700"
          :style="{ font: 'var(--font-label)' }"
          @click="startAdd(node.parent.id)"
        >
          <Plus :size="14" /> 新增子分類
        </button>
      </div>
    </AppCard>

    <!-- Add parent -->
    <AppCard v-if="adding && !adding.parentId">
      <input
        v-model="draftName"
        class="input w-full"
        placeholder="分類名稱"
        autofocus
        @keyup.enter="commitAdd"
      />
      <p class="mt-3 text-text-secondary" :style="{ font: 'var(--font-label)' }">選一個圖示</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="ic in ICON_CHOICES"
          :key="ic"
          class="flex h-10 w-10 items-center justify-center rounded-md border transition-colors"
          :class="draftIcon === ic ? 'border-sage-500 bg-sage-50' : 'border-border'"
          @click="draftIcon = ic"
        >
          <CategoryIconPreview :name="ic" />
        </button>
      </div>
      <div class="mt-4 flex gap-2">
        <button class="btn-ghost flex-1" @click="adding = null">取消</button>
        <button class="btn-primary flex-1" :disabled="!draftName.trim()" @click="commitAdd">
          新增
        </button>
      </div>
    </AppCard>

    <button v-else class="btn-secondary w-full" @click="startAdd()">
      <Plus :size="18" /> 新增分類
    </button>
  </div>
</template>

<script lang="ts">
// A tiny inline preview so the icon picker can render a lucide glyph by name without
// routing through a real Category (CategoryIcon needs a categoryId).
import { defineComponent, h, type Component } from 'vue'
import {
  Bus,
  CarTaxiFront,
  CircleEllipsis,
  Clapperboard,
  Gamepad2,
  House,
  ShoppingBag,
  ShoppingBasket,
  TrainFront,
  Utensils,
  Wallet,
} from '@lucide/vue'

const MAP: Record<string, Component> = {
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  bus: Bus,
  'train-front': TrainFront,
  'car-taxi-front': CarTaxiFront,
  'gamepad-2': Gamepad2,
  clapperboard: Clapperboard,
  'shopping-bag': ShoppingBag,
  house: House,
  wallet: Wallet,
  'circle-ellipsis': CircleEllipsis,
}

const CategoryIconPreview = defineComponent({
  name: 'CategoryIconPreview',
  props: { name: { type: String, required: true } },
  setup(props) {
    return () => h(MAP[props.name] ?? CircleEllipsis, { size: 20, class: 'text-text-secondary' })
  },
})

export default { components: { CategoryIconPreview } }
</script>
