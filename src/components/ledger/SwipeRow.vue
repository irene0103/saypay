<script setup lang="ts">
/**
 * Swipe-to-reveal row — spec §3.1 (最近記錄左滑編輯／刪除).
 *
 * Drag the row left to expose 編輯 / 刪除; a plain tap (no meaningful drag) selects it.
 * Pointer events drive it, so the same code covers touch and a mouse drag. `touch-action:
 * pan-y` on the front keeps vertical list scrolling with the browser while claiming only
 * the horizontal gesture for us.
 */
import { ref } from 'vue'
import { Pencil, Trash2 } from '@lucide/vue'

const emit = defineEmits<{ select: []; edit: []; delete: [] }>()

const ACTIONS_WIDTH = 132
const TAP_SLOP = 6 // px of movement still counted as a tap, not a drag

const translate = ref(0)
const dragging = ref(false)
let startX = 0
let base = 0
let moved = false

function onDown(e: PointerEvent) {
  // Capture keeps move/up events coming to us even if the finger leaves the row; if the
  // pointer id is one the browser won't capture, the swipe still works from events landing
  // on the element, so a failure here must not abort the gesture.
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* non-capturable pointer — proceed without capture */
  }
  dragging.value = true
  startX = e.clientX
  base = translate.value
  moved = false
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  const dx = e.clientX - startX
  if (Math.abs(dx) > TAP_SLOP) moved = true
  // Clamp to [-ACTIONS_WIDTH, 0]: can't drag right past closed, or left past fully open.
  translate.value = Math.max(-ACTIONS_WIDTH, Math.min(0, base + dx))
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  if (!moved) {
    // A tap: snap shut and select, unless the row was already open (then just close it).
    const wasOpen = translate.value < -TAP_SLOP
    translate.value = 0
    if (!wasOpen) emit('select')
    return
  }
  // A drag: settle to whichever end it's closer to.
  translate.value = translate.value < -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0
}

function edit() {
  translate.value = 0
  emit('edit')
}

function del() {
  translate.value = 0
  emit('delete')
}
</script>

<template>
  <div class="relative overflow-hidden">
    <!-- Actions sit behind the row and are uncovered as it slides left. -->
    <div class="absolute inset-y-0 right-0 flex" :style="{ width: `${ACTIONS_WIDTH}px` }">
      <button
        class="flex flex-1 flex-col items-center justify-center gap-1 bg-sage-100 text-sage-700"
        :style="{ font: 'var(--font-caption)' }"
        @click="edit"
      >
        <Pencil :size="18" /> 編輯
      </button>
      <button
        class="flex flex-1 flex-col items-center justify-center gap-1 bg-payable text-white"
        :style="{ font: 'var(--font-caption)' }"
        @click="del"
      >
        <Trash2 :size="18" /> 刪除
      </button>
    </div>

    <div
      class="relative bg-surface"
      :style="{
        transform: `translateX(${translate}px)`,
        transition: dragging ? 'none' : 'transform 200ms ease-out',
        touchAction: 'pan-y',
      }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <slot />
    </div>
  </div>
</template>
