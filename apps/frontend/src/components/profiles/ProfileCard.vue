<script setup lang="ts">
import type { Profile } from '@/services/storage'

const props = defineProps<{
	profile: Profile
}>()

const emit = defineEmits<{
	(event: 'connect', profile: Profile): void
	(event: 'edit', profile: Profile): void
}>()

function connect(): void {
	emit('connect', props.profile)
}

function edit(event: MouseEvent): void {
	event.stopPropagation()
	emit('edit', props.profile)
}
</script>

<template>
	<div
		role="button"
		tabindex="0"
		class="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900"
		@click="connect"
		@keydown.enter="connect"
	>
		<span
			class="h-2.5 w-2.5 shrink-0 rounded-full"
			:style="{ backgroundColor: profile.color ?? 'var(--app-muted)' }"
			aria-hidden="true"
		/>

		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{{ profile.nickname }}</p>
			<p class="truncate text-xs text-[var(--app-muted)]">
				{{ profile.username }}@{{ profile.host }}:{{ profile.port }}
			</p>
			<div v-if="profile.tags.length > 0" class="mt-1 flex flex-wrap gap-1">
				<span
					v-for="tag in profile.tags"
					:key="tag"
					class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--app-muted)] dark:bg-slate-800"
				>
					{{ tag }}
				</span>
			</div>
		</div>

		<button
			type="button"
			class="rounded-full p-1.5 opacity-0 transition hover:bg-slate-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:bg-slate-800"
			aria-label="Edit profile"
			@click="edit"
		>
			<svg viewBox="0 0 20 20" fill="none" class="h-4 w-4" aria-hidden="true">
				<path
					d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
</template>
