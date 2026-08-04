<script setup lang="ts">
defineProps<{
	title?: string
}>()
</script>

<template>
	<div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(180deg,_var(--app-bg),_#020617)] text-[var(--app-fg)]">
		<div class="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4 sm:p-6">
			<header class="flex items-center justify-between rounded-3xl border border-white/10 bg-white/70 px-5 py-4 shadow-[0_18px_60px_rgba(2,6,23,0.12)] backdrop-blur dark:bg-slate-950/60">
				<div>
					<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Secure Browser SSH</p>
					<h1 class="text-2xl font-semibold">{{ title ?? 'Buddy-SSH Workspace' }}</h1>
				</div>
				<slot name="header" />
			</header>

			<div class="grid min-h-[calc(100vh-9.5rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
				<aside class="rounded-3xl border border-white/10 bg-white/75 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.12)] backdrop-blur dark:bg-slate-950/65 lg:row-span-3">
					<slot name="sidebar" />
				</aside>

				<section class="rounded-3xl border border-white/10 bg-white/75 p-3 shadow-[0_18px_60px_rgba(2,6,23,0.12)] backdrop-blur dark:bg-slate-950/65">
					<slot name="tabbar" />
				</section>

				<section class="min-h-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-4 text-slate-100 shadow-[0_30px_80px_rgba(2,6,23,0.45)] lg:h-full lg:min-h-0">
					<slot />
				</section>

				<footer class="rounded-3xl border border-white/10 bg-white/75 px-4 py-3 shadow-[0_18px_60px_rgba(2,6,23,0.12)] backdrop-blur dark:bg-slate-950/65">
					<slot name="status" />
				</footer>
			</div>
		</div>
	</div>
</template>