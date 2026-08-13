<script setup lang="ts">
import { computed, ref } from 'vue'
import ProfileEditor from '@/components/profiles/ProfileEditor.vue'
import { exportProfiles, importProfiles, ProfileImportError } from '@/services/profileImportExport'
import type { Profile } from '@/services/storage'
import { useProfileStore } from '@/stores/useProfileStore'

const store = useProfileStore()
const isEditorOpen = ref(false)
const editingProfile = ref<Profile | null>(null)
const pendingDeleteId = ref<string | null>(null)
const folderFilter = ref<string | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)
const importSuccessCount = ref<number | null>(null)

const folders = computed(() => {
  const set = new Set<string>()
  for (const profile of store.profiles) {
    set.add(profile.folder?.trim() || 'Uncategorized')
  }
  return Array.from(set).sort()
})

const groupedProfiles = computed(() => {
  const groups = new Map<string, Profile[]>()
  for (const profile of store.profiles) {
    const folder = profile.folder?.trim() || 'Uncategorized'
    if (folderFilter.value && folder !== folderFilter.value) {
      continue
    }

    const list = groups.get(folder) ?? []
    list.push(profile)
    groups.set(folder, list)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, profiles]) => ({
      folder,
      profiles: profiles.sort((a, b) => a.nickname.localeCompare(b.nickname)),
    }))
})

function openNew(): void {
  editingProfile.value = null
  isEditorOpen.value = true
}

function openEdit(profile: Profile): void {
  editingProfile.value = profile
  isEditorOpen.value = true
}

function handleSave(profile: Profile): void {
  void store.save(profile)
}

function requestDelete(id: string): void {
  pendingDeleteId.value = id
}

function cancelDelete(): void {
  pendingDeleteId.value = null
}

function confirmDelete(id: string): void {
  void store.remove(id)
  pendingDeleteId.value = null
}

function handleExport(): void {
  const json = exportProfiles(store.profiles)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `buddy-ssh-profiles-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function triggerImport(): void {
  importError.value = null
  importSuccessCount.value = null
  importInput.value?.click()
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  try {
    const text = await file.text()
    const imported = importProfiles(text)
    for (const profile of imported) {
      await store.save(profile)
    }
    importSuccessCount.value = imported.length
    importError.value = null
  } catch (error) {
    importSuccessCount.value = null
    importError.value =
      error instanceof ProfileImportError ? error.message : 'Failed to import profiles'
  }
}
</script>

<template>
	<div class="mx-auto max-w-4xl space-y-6 p-6">
		<div class="flex items-center justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Manage</p>
				<h1 class="mt-2 text-2xl font-semibold">Profiles</h1>
			</div>
			<div class="flex items-center gap-2">
				<input ref="importInput" type="file" accept="application/json" class="hidden" @change="handleImportFile" />
				<button
					type="button"
					class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:border-sky-300 dark:border-slate-700"
					@click="triggerImport"
				>
					Import
				</button>
				<button
					type="button"
					class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition hover:border-sky-300 dark:border-slate-700"
					:disabled="store.profiles.length === 0"
					:class="{ 'cursor-not-allowed opacity-50': store.profiles.length === 0 }"
					@click="handleExport"
				>
					Export
				</button>
				<button
					type="button"
					class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400"
					@click="openNew"
				>
					New Profile
				</button>
			</div>
		</div>

		<p v-if="importError" role="alert" class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
			{{ importError }}
		</p>
		<p v-else-if="importSuccessCount !== null" role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
			Imported {{ importSuccessCount }} profile{{ importSuccessCount === 1 ? '' : 's' }}.
		</p>

		<div v-if="folders.length > 1" class="flex flex-wrap gap-2" role="radiogroup" aria-label="Filter by folder">
			<button
				type="button"
				class="rounded-full border px-3 py-1 text-xs font-medium transition"
				:class="folderFilter === null ? 'border-sky-400 bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'"
				@click="folderFilter = null"
			>
				All
			</button>
			<button
				v-for="folder in folders"
				:key="folder"
				type="button"
				class="rounded-full border px-3 py-1 text-xs font-medium transition"
				:class="folderFilter === folder ? 'border-sky-400 bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'"
				@click="folderFilter = folder"
			>
				{{ folder }}
			</button>
		</div>

		<p v-if="store.profiles.length === 0" class="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-[var(--app-muted)] dark:border-slate-700">
			No saved profiles yet. Create one from here or from an active session's "Save as Profile" button.
		</p>

		<div v-for="group in groupedProfiles" :key="group.folder" class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--app-muted)]">
				{{ group.folder }}
			</h2>

			<div
				v-for="profile in group.profiles"
				:key="profile.id"
				class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
			>
				<span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: profile.color ?? 'var(--app-muted)' }" aria-hidden="true" />

				<div class="min-w-0 flex-1">
					<p class="truncate font-medium">{{ profile.nickname }}</p>
					<p class="truncate text-sm text-[var(--app-muted)]">
						{{ profile.username }}@{{ profile.host }}:{{ profile.port }} · {{ profile.authType }}
					</p>
					<p v-if="profile.notes" class="mt-1 truncate text-xs text-[var(--app-muted)]">{{ profile.notes }}</p>
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

				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:border-sky-300 dark:border-slate-700"
						@click="openEdit(profile)"
					>
						Edit
					</button>
					<template v-if="pendingDeleteId === profile.id">
						<button
							type="button"
							class="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
							@click="confirmDelete(profile.id)"
						>
							Confirm delete
						</button>
						<button
							type="button"
							class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
							@click="cancelDelete"
						>
							Cancel
						</button>
					</template>
					<button
						v-else
						type="button"
						class="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
						@click="requestDelete(profile.id)"
					>
						Delete
					</button>
				</div>
			</div>
		</div>

		<ProfileEditor
			:open="isEditorOpen"
			:profile="editingProfile"
			@save="handleSave"
			@update:open="isEditorOpen = $event"
		/>
	</div>
</template>
