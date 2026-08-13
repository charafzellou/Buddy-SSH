<script setup lang="ts">
import ProfileCard from '@/components/profiles/ProfileCard.vue'
import type { Profile } from '@/services/storage'
import { useProfileStore } from '@/stores/useProfileStore'

const emit = defineEmits<{
	(event: 'connect', profile: Profile): void
	(event: 'edit', profile: Profile): void
}>()

const store = useProfileStore()
</script>

<template>
	<div class="space-y-2">
		<ProfileCard
			v-for="profile in store.profiles"
			:key="profile.id"
			:profile="profile"
			@connect="emit('connect', profile)"
			@edit="emit('edit', profile)"
		/>
		<p
			v-if="!store.isLoading && store.profiles.length === 0"
			class="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-[var(--app-muted)] dark:border-slate-700"
		>
			No saved profiles yet.
		</p>
	</div>
</template>
