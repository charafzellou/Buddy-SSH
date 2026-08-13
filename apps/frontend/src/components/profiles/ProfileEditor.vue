<script setup lang="ts">
import type { Profile } from '@/services/storage'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
	open: boolean
	profile?: Profile | null
}>()

const emit = defineEmits<{
	(event: 'save', profile: Profile): void
	(event: 'cancel'): void
	(event: 'update:open', value: boolean): void
}>()

const nickname = ref('')
const host = ref('')
const port = ref(22)
const username = ref('')
const authType = ref<Profile['authType']>('password')
const tagsText = ref('')
const folder = ref('')
const notes = ref('')
const color = ref('#38bdf8')

// A profile without an id (e.g. pre-filled from an active session via
// "Save as profile") is still a *new* profile, not an edit of an existing
// one, even though `profile` itself is non-null.
const isEditing = computed(() => Boolean(props.profile?.id))

watch(
	() => [props.open, props.profile] as const,
	([open, profile]) => {
		if (!open) {
			return
		}

		nickname.value = profile?.nickname ?? ''
		host.value = profile?.host ?? ''
		port.value = profile?.port ?? 22
		username.value = profile?.username ?? ''
		authType.value = profile?.authType ?? 'password'
		tagsText.value = profile?.tags.join(', ') ?? ''
		folder.value = profile?.folder ?? ''
		notes.value = profile?.notes ?? ''
		color.value = profile?.color ?? '#38bdf8'
	},
	{ immediate: true },
)

const canSave = computed(() => nickname.value.trim() !== '' && host.value.trim() !== '' && username.value.trim() !== '')

function parseTags(text: string): string[] {
	return text
		.split(',')
		.map((tag) => tag.trim())
		.filter((tag) => tag !== '')
}

function save(): void {
	if (!canSave.value) {
		return
	}

	const now = Date.now()
	const saved: Profile = {
		id: props.profile?.id ?? createProfileID(),
		nickname: nickname.value.trim(),
		host: host.value.trim(),
		port: port.value,
		username: username.value.trim(),
		authType: authType.value,
		keyId: props.profile?.keyId,
		tags: parseTags(tagsText.value),
		folder: folder.value.trim() || undefined,
		notes: notes.value.trim() || undefined,
		color: color.value,
		terminalPrefs: props.profile?.terminalPrefs ?? {},
		connectionPrefs: props.profile?.connectionPrefs ?? {},
		jumpHosts: props.profile?.jumpHosts,
		createdAt: props.profile?.createdAt ?? now,
		updatedAt: now,
	}

	emit('save', saved)
	close()
}

function close(): void {
	emit('cancel')
	emit('update:open', false)
}

function createProfileID(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}

	return `profile-${Math.random().toString(36).slice(2, 10)}`
}
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
		<div class="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white p-6 shadow-[0_30px_90px_rgba(2,6,23,0.25)] dark:bg-slate-950">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Profile</p>
					<h2 class="mt-2 text-2xl font-semibold">{{ isEditing ? 'Edit profile' : 'New profile' }}</h2>
				</div>
				<button class="rounded-full px-3 py-1 text-sm text-[var(--app-muted)] transition hover:bg-slate-100 dark:hover:bg-slate-900" @click="close">
					Close
				</button>
			</div>

			<form class="mt-6 grid grid-cols-2 gap-4" @submit.prevent="save">
				<label class="col-span-2 block space-y-2">
					<span class="text-sm font-medium">Nickname</span>
					<input v-model="nickname" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Host</span>
					<input v-model="host" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Port</span>
					<input v-model.number="port" type="number" min="1" max="65535" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Username</span>
					<input v-model="username" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Auth type</span>
					<select v-model="authType" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900">
						<option value="password">Password</option>
						<option value="publickey">Private Key</option>
						<option value="keyboard-interactive">Keyboard Interactive</option>
					</select>
				</label>

				<label class="col-span-2 block space-y-2">
					<span class="text-sm font-medium">Tags (comma-separated)</span>
					<input v-model="tagsText" placeholder="prod, web" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Folder</span>
					<input v-model="folder" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Color</span>
					<input v-model="color" type="color" class="h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<label class="col-span-2 block space-y-2">
					<span class="text-sm font-medium">Notes</span>
					<textarea v-model="notes" rows="3" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900" />
				</label>

				<div class="col-span-2 flex justify-end gap-3 pt-2">
					<button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-[var(--app-muted)]" @click="close">
						Cancel
					</button>
					<button
						type="submit"
						:disabled="!canSave"
						class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Save
					</button>
				</div>
			</form>
		</div>
	</div>
</template>
