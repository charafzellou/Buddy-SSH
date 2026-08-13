<script setup lang="ts">
import type { StatusPayload } from '@buddy-ssh/shared'
import { computed } from 'vue'

const props = defineProps<{
  id: string
  label: string
  state: StatusPayload['state']
  active: boolean
  pinned: boolean
  color?: string
}>()

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'pin', id: string): void
  (event: 'close', id: string): void
}>()

const isDisconnected = computed(() => props.state === 'disconnected' || props.state === 'error')

const statusDotClass = computed(() => {
  switch (props.state) {
    case 'connected':
      return 'bg-emerald-400'
    case 'connecting':
    case 'reconnecting':
      return 'bg-amber-400 animate-pulse'
    case 'error':
      return 'bg-rose-500'
    default:
      return 'bg-slate-400'
  }
})

function select(): void {
  emit('select', props.id)
}

function togglePin(event: MouseEvent): void {
  event.stopPropagation()
  emit('pin', props.id)
}

function close(event: MouseEvent): void {
  event.stopPropagation()
  emit('close', props.id)
}
</script>

<template>
	<div
		role="tab"
		:aria-selected="active"
		:data-state="state"
		tabindex="0"
		class="group flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition"
		:class="[
			active
				? 'border-slate-950 bg-slate-950 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-slate-950'
				: 'border-slate-200 text-slate-600 hover:border-sky-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-300 dark:hover:text-white',
			isDisconnected && !active ? 'opacity-60' : '',
		]"
		@click="select"
		@keydown.enter="select"
		@keydown.space.prevent="select"
	>
		<span
			v-if="color"
			class="h-2 w-2 shrink-0 rounded-full"
			:style="{ backgroundColor: color }"
			aria-hidden="true"
		/>
		<span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="statusDotClass" aria-hidden="true" />

		<span class="max-w-[12rem] truncate">{{ label }}</span>

		<button
			type="button"
			class="rounded-full p-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
			:class="pinned ? '!opacity-100 text-sky-400' : ''"
			:aria-pressed="pinned"
			:aria-label="pinned ? 'Unpin tab' : 'Pin tab'"
			@click="togglePin"
		>
			<svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5" aria-hidden="true">
				<path d="M10 2v6l3 3H7l3-3V2z" fill="currentColor" />
				<path d="M10 11v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>

		<button
			type="button"
			class="rounded-full p-0.5 opacity-0 transition hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:bg-white/10"
			aria-label="Close tab"
			@click="close"
		>
			<svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5" aria-hidden="true">
				<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>
	</div>
</template>
