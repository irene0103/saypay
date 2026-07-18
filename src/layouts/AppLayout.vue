<script setup lang="ts">
/**
 * The app shell — design-system.md §3.2.
 * Phone: bottom tab with a raised centre FAB. Tablet (≥768px): left sidebar, no tab bar.
 */
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { BookText, Users, Plus, ChartPie, Settings } from '@lucide/vue'

import { db, requestPersistentStorage } from '@/db'
import { seedDev } from '@/db/seed'
import { useLedgerStore } from '@/stores/ledger'
import UndoToast from '@/components/ui/UndoToast.vue'

const ledger = useLedgerStore()
const route = useRoute()
const router = useRouter()

// The 帳本 tab lands on the Dashboard (wireframe 1a); the full ledger list/calendar
// (1b) hangs off its "See all".
const tabs = [
  { name: 'dashboard', label: '帳本', icon: BookText },
  { name: 'split', label: '分帳', icon: Users },
  { name: 'analytics', label: '分析', icon: ChartPie },
  { name: 'settings', label: '設定', icon: Settings },
] as const

onMounted(async () => {
  // Ask to keep our data before writing any (spec §3.12 L1).
  await requestPersistentStorage()
  await db.open()
  if (import.meta.env.DEV) await seedDev()
  await ledger.load()
})

const isActive = (name: string) => route.name === name
</script>

<template>
  <div class="min-h-full bg-bg md:flex">
    <!-- Tablet sidebar (wireframe 1m) -->
    <nav
      class="hidden shrink-0 flex-col border-r border-border bg-surface p-4 md:flex"
      :style="{ width: 'var(--sidebar-width)' }"
    >
      <RouterLink to="/" class="mb-6 px-2 text-text" :style="{ font: 'var(--font-h1)' }">
        分分帳
      </RouterLink>
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="mb-1 flex items-center gap-3 rounded-md px-3 py-2 transition-colors"
        :class="
          isActive(tab.name)
            ? 'bg-sage-100 text-sage-700'
            : 'text-text-secondary hover:bg-surface-alt'
        "
        :style="{ font: 'var(--font-body)' }"
      >
        <component :is="tab.icon" :size="20" />
        {{ tab.label }}
      </RouterLink>

      <button class="btn-primary mt-auto w-full" @click="router.push({ name: 'tx-new' })">
        <Plus :size="20" /> 記一筆
      </button>
    </nav>

    <!-- Content -->
    <main class="mx-auto w-full flex-1" :style="{ maxWidth: 'var(--content-max)' }">
      <div class="px-4 pb-24 pt-4 md:pb-8">
        <RouterView />
      </div>
    </main>

    <!-- Phone bottom tab (design-system.md §5.5) -->
    <nav
      class="app-tabbar fixed inset-x-0 bottom-0 z-20 flex items-end border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      :style="{ height: 'calc(var(--tab-height) + env(safe-area-inset-bottom))' }"
    >
      <RouterLink
        v-for="(tab, i) in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
        :class="[
          isActive(tab.name) ? 'text-sage-700' : 'text-text-tertiary',
          // The FAB occupies the centre slot, so the tabs split around it.
          i === 2 ? 'order-4' : '',
          i === 3 ? 'order-5' : '',
        ]"
        :style="{ height: 'var(--tab-height)' }"
      >
        <component :is="tab.icon" :size="20" />
        <span :style="{ font: 'var(--font-micro)' }">{{ tab.label }}</span>
      </RouterLink>

      <!-- Raised centre FAB — the only element here with a shadow (§3.4) -->
      <button
        class="order-3 -mt-2 flex h-13 w-13 shrink-0 items-center justify-center rounded-pill bg-sage-500 text-white shadow-fab"
        aria-label="記一筆"
        @click="router.push({ name: 'tx-new' })"
      >
        <Plus :size="24" />
      </button>
    </nav>

    <UndoToast />
  </div>
</template>
