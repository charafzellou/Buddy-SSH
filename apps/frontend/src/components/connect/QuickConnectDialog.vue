<script setup lang="ts">
import { useSessionStore } from '@/stores/useSessionStore'
import { computed, ref } from 'vue'

export interface QuickConnectPayload {
  tabId: string
  username: string
  host: string
  port: number
  password: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (event: 'connect', payload: QuickConnectPayload): void
  (event: 'update:open', value: boolean): void
}>()

const store = useSessionStore()
const destination = ref('')
const password = ref('')
const errorMessage = ref('')

const isVisible = computed(() => props.open)

function closeDialog(): void {
  errorMessage.value = ''
  emit('update:open', false)
}

function submit(): void {
  const parsed = parseDestination(destination.value)
  if (!parsed) {
    errorMessage.value = 'Enter a destination as user@host:port'
    return
  }

  if (password.value.trim() === '') {
    errorMessage.value = 'Password is required for the MVP flow'
    return
  }

  const tab = store.openTab({
    label: `${parsed.username}@${parsed.host}`,
    state: 'connecting',
  })

  emit('connect', {
    tabId: tab.id,
    username: parsed.username,
    host: parsed.host,
    port: parsed.port,
    password: password.value,
  })

  destination.value = ''
  password.value = ''
  errorMessage.value = ''
  closeDialog()
}

function parseDestination(value: string): { username: string; host: string; port: number } | null {
  const match = value.trim().match(/^(?<username>[^@\s]+)@(?<host>[^:\s]+)(?::(?<port>\d{1,5}))?$/)
  if (!match?.groups) {
    return null
  }

  const port = match.groups.port ? Number(match.groups.port) : 22
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  return {
    username: match.groups.username,
    host: match.groups.host,
    port,
  }
}
</script>

<template>
	<div v-if="isVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
		<div class="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white p-6 shadow-[0_30px_90px_rgba(2,6,23,0.25)] dark:bg-slate-950">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Quick Connect</p>
					<h2 class="mt-2 text-2xl font-semibold">Open a new session</h2>
				</div>
				<button class="rounded-full px-3 py-1 text-sm text-[var(--app-muted)] transition hover:bg-slate-100 dark:hover:bg-slate-900" @click="closeDialog">
					Close
				</button>
			</div>

			<form class="mt-6 space-y-4" @submit.prevent="submit">
				<label class="block space-y-2">
					<span class="text-sm font-medium">Destination</span>
					<input
						v-model="destination"
						placeholder="ops@example.com:22"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900"
					/>
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Password</span>
					<input
						v-model="password"
						type="password"
						placeholder="Password"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900"
					/>
				</label>

				<p v-if="errorMessage" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
					{{ errorMessage }}
				</p>

				<div class="flex justify-end gap-3 pt-2">
					<button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-[var(--app-muted)]" @click="closeDialog">
						Cancel
					</button>
					<button type="submit" class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400">
						Connect
					</button>
				</div>
			</form>
		</div>
	</div>
</template>