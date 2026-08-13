<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
	open: boolean
	host: string
	algorithm: string
	oldFingerprint: string
	newFingerprint: string
}>()

const emit = defineEmits<{
	(event: 'repin'): void
	(event: 'abort'): void
}>()

const confirmationText = ref('')

watch(
	() => props.open,
	(open) => {
		if (!open) {
			confirmationText.value = ''
		}
	},
)

const canRepin = computed(() => confirmationText.value.trim() === props.host)

function repin(): void {
	if (!canRepin.value) {
		return
	}

	emit('repin')
}

function abort(): void {
	emit('abort')
}
</script>

<template>
	<div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/60 px-4 backdrop-blur-sm">
		<div class="w-full max-w-lg rounded-[2rem] border-2 border-rose-500/60 bg-white p-6 shadow-[0_30px_90px_rgba(190,18,60,0.35)] dark:bg-slate-950">
			<p class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 dark:text-rose-400">
				⚠ Host Key Changed
			</p>
			<h2 class="mt-2 text-2xl font-semibold text-rose-700 dark:text-rose-300">
				This could be an attack
			</h2>
			<p class="mt-2 text-sm text-[var(--app-muted)]">
				The host key presented by <strong>{{ props.host }}</strong> no longer matches the one you
				previously pinned. This can happen after a legitimate server rebuild, but it can also mean
				someone is intercepting your connection. Verify out-of-band before proceeding.
			</p>

			<dl class="mt-4 space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900/60 dark:bg-rose-950/40">
				<div>
					<dt class="text-[var(--app-muted)]">Algorithm</dt>
					<dd class="font-mono">{{ props.algorithm }}</dd>
				</div>
				<div>
					<dt class="text-[var(--app-muted)]">Previously pinned fingerprint</dt>
					<dd class="break-all font-mono text-emerald-700 dark:text-emerald-400">{{ props.oldFingerprint }}</dd>
				</div>
				<div>
					<dt class="text-[var(--app-muted)]">Newly presented fingerprint</dt>
					<dd class="break-all font-mono text-rose-700 dark:text-rose-400">{{ props.newFingerprint }}</dd>
				</div>
			</dl>

			<label class="mt-4 block space-y-2">
				<span class="text-sm font-medium">
					Type <code class="rounded bg-slate-100 px-1 dark:bg-slate-900">{{ props.host }}</code> to confirm re-pinning
				</span>
				<input
					v-model="confirmationText"
					:placeholder="props.host"
					class="w-full rounded-2xl border border-rose-300 bg-rose-50/50 px-4 py-3 text-sm outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200 dark:border-rose-900 dark:bg-slate-900"
				/>
			</label>

			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					class="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
					@click="abort"
				>
					Abort Connection
				</button>
				<button
					type="button"
					:disabled="!canRepin"
					class="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(190,18,60,0.35)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
					@click="repin"
				>
					Re-pin Anyway
				</button>
			</div>
		</div>
	</div>
</template>
