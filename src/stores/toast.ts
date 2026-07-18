/**
 * Transient toasts, including the Undo toast — spec §3.12 L2.
 *
 * A delete shows 「已刪除 · 復原」 for 5 seconds. During that window the sync push is
 * deliberately deferred by the caller: undoing within 5s should cost zero network round
 * trips. (The delete has already hit IndexedDB, so it survives a refresh either way.)
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Toast {
  id: string
  message: string
  /** Present → the toast shows a 復原 action that invokes this. */
  undo?: () => void | Promise<void>
}

const UNDO_MS = 5000

export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear() {
    if (timer) clearTimeout(timer)
    timer = undefined
    current.value = null
  }

  function show(message: string, undo?: () => void | Promise<void>) {
    clear()
    const id = crypto.randomUUID()
    current.value = { id, message, undo }
    timer = setTimeout(() => {
      // Only dismiss if this exact toast is still the one showing.
      if (current.value?.id === id) current.value = null
    }, UNDO_MS)
  }

  async function runUndo() {
    const u = current.value?.undo
    clear()
    if (u) await u()
  }

  return { current, show, runUndo, dismiss: clear }
})
