<script setup lang="ts">
/**
 * The public share page — spec §3.11.
 *
 * ⚠️ PRIVACY BOUNDARY. This component must NEVER import useLedgerStore, the Dexie db, or
 * any app navigation. It renders only what the backend RPC returns for this token.
 *
 * If it could read the app's own state, the recipient would see every other transaction,
 * the owner's budget, and their debts with other people. That is the exact incident
 * spec §3.11 隱私鐵則 exists to prevent — which is why the isolation lives in the route
 * tree (this is not a child of AppLayout) rather than in a conditional.
 *
 * Filtering by detailLevel happens SERVER-SIDE (spec §3.11 實作鐵則). Hiding fields in the
 * template would leave them in the payload for anyone who opens DevTools.
 */
defineProps<{ token: string }>()
</script>

<template>
  <main class="mx-auto min-h-full max-w-[520px] bg-bg px-4 py-8">
    <!-- TODO(Phase 5): fetch(`/rpc/share/${token}`) → render total | full states,
         plus the 已結清 terminal page and the 已失效 state. -->
    <p class="text-text-secondary" :style="{ font: 'var(--font-body)' }">
      分享頁（Phase 5）· token: {{ token }}
    </p>
    <footer class="mt-8 text-text-tertiary" :style="{ font: 'var(--font-caption)' }">
      由 SayPay 產生 · 唯讀
    </footer>
  </main>
</template>
