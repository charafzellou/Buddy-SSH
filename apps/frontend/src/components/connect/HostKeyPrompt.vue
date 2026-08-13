<script setup lang="ts">
const props = defineProps<{
  open: boolean
  host: string
  algorithm: string
  fingerprint: string
}>()

const emit = defineEmits<{
  (event: 'accept'): void
  (event: 'reject'): void
}>()

function accept(): void {
  emit('accept')
}

function reject(): void {
  emit('reject')
}
</script>

<template>
	<div v-if="props.open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
		<div class="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white p-6 shadow-[0_30px_90px_rgba(2,6,23,0.25)] dark:bg-slate-950">
			<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Host Key</p>
			<h2 class="mt-2 text-2xl font-semibold">Trust this fingerprint?</h2>
			<p class="mt-2 text-sm text-[var(--app-muted)]">
				This is the first time you're connecting to <strong>{{ props.host }}</strong>. Verify the
				fingerprint out-of-band if possible before trusting it.
			</p>

			<dl class="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
				<div class="flex justify-between gap-4">
					<dt class="text-[var(--app-muted)]">Algorithm</dt>
					<dd class="font-mono">{{ props.algorithm }}</dd>
				</div>
				<div class="flex justify-between gap-4">
					<dt class="text-[var(--app-muted)]">Fingerprint</dt>
					<dd class="break-all text-right font-mono">{{ props.fingerprint }}</dd>
				</div>
			</dl>

			<div class="mt-6 flex justify-end gap-3">
				<button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-rose-600 dark:text-rose-400" @click="reject">
					Reject &amp; Disconnect
				</button>
				<button
					type="button"
					class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400"
					@click="accept"
				>
					Trust &amp; Pin
				</button>
			</div>
		</div>
	</div>
</template>
