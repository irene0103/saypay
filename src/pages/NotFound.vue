<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-12 text-center">
    <p class="text-text-secondary" :style="{ font: 'var(--font-body)' }">找不到這一頁</p>
    <RouterLink to="/" class="btn-secondary">回首頁</RouterLink>
  </div>
</template>
