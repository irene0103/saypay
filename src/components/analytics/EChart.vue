<script setup lang="ts">
/**
 * Thin ECharts wrapper. Imports only the pieces we use — the full bundle is ~1MB and this
 * is a PWA people open on phones.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([PieChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = withDefaults(defineProps<{ option: EChartsOption; height?: number }>(), {
  height: 220,
})

const el = ref<HTMLDivElement>()
const chart = shallowRef<echarts.ECharts>()

const resize = () => chart.value?.resize()

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  chart.value.setOption(props.option)
  window.addEventListener('resize', resize)
})

// `notMerge` — a stale series would otherwise linger when the category set shrinks.
watch(
  () => props.option,
  (o) => chart.value?.setOption(o, true),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart.value?.dispose()
})
</script>

<template>
  <div ref="el" :style="{ height: `${height}px`, width: '100%' }" />
</template>
