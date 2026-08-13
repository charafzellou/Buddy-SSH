<script setup lang="ts">
import type { StatusPayload } from '@buddy-ssh/shared'
import { computed } from 'vue'

const props = defineProps<{
  state: StatusPayload['state']
  latency?: number | null
}>()

const label = computed(() => props.state.charAt(0).toUpperCase() + props.state.slice(1))
const stateClass = computed(() => {
  switch (props.state) {
    case 'connected':
      return 'bg-emerald-400'
    case 'connecting':
    case 'reconnecting':
      return 'bg-amber-400'
    case 'error':
      return 'bg-rose-400'
    default:
      return 'bg-slate-400'
  }
})
</script>

<template>
	<div class="flex items-center justify-between gap-3 text-sm">
		<div class="flex items-center gap-2">
			<span :class="stateClass" class="inline-flex h-2.5 w-2.5 rounded-full" />
			<span class="font-medium">{{ label }}</span>
		</div>
		<span class="text-[var(--app-muted)]">
			{{ latency != null ? `${latency} ms` : 'Latency unavailable' }}
		</span>
	</div>
</template>