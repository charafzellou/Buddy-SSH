<script setup lang="ts">
import TabItem from '@/components/tabs/TabItem.vue'
import { useSessionStore } from '@/stores/useSessionStore'
import { ref } from 'vue'

const store = useSessionStore()
const draggedId = ref<string | null>(null)

function handleSelect(id: string): void {
	store.setActive(id)
}

function handlePin(id: string): void {
	store.pinTab(id)
}

function handleClose(id: string): void {
	store.closeTab(id)
}

function handleDragStart(id: string, event: DragEvent): void {
	draggedId.value = id
	event.dataTransfer?.setData('text/plain', id)
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
	}
}

function handleDragEnd(): void {
	draggedId.value = null
}

// Dropping tab A onto tab B moves A to B's current position (index-based
// reorder), matching the drag affordance most tabbed UIs use.
function handleDrop(targetId: string, event: DragEvent): void {
	const sourceId = draggedId.value ?? event.dataTransfer?.getData('text/plain') ?? null
	draggedId.value = null
	if (!sourceId || sourceId === targetId) {
		return
	}

	const ids = store.tabs.map((tab) => tab.id)
	const fromIndex = ids.indexOf(sourceId)
	const toIndex = ids.indexOf(targetId)
	if (fromIndex === -1 || toIndex === -1) {
		return
	}

	ids.splice(fromIndex, 1)
	ids.splice(toIndex, 0, sourceId)
	store.reorder(ids)
}
</script>

<template>
	<div
		v-if="store.tabs.length > 0"
		role="tablist"
		aria-label="Open sessions"
		class="flex flex-wrap items-center gap-3"
	>
		<TabItem
			v-for="tab in store.tabs"
			:id="tab.id"
			:key="tab.id"
			:label="tab.label"
			:state="tab.state"
			:active="tab.id === store.activeTabId"
			:pinned="tab.pinned"
			:color="tab.color"
			draggable="true"
			:class="{ 'opacity-50': draggedId === tab.id }"
			@select="handleSelect"
			@pin="handlePin"
			@close="handleClose"
			@dragstart="handleDragStart(tab.id, $event)"
			@dragend="handleDragEnd"
			@dragover.prevent
			@drop.prevent="handleDrop(tab.id, $event)"
		/>
	</div>
	<div
		v-else
		class="rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm text-[var(--app-muted)] dark:border-slate-700"
	>
		Open a quick-connect session to start a terminal.
	</div>
</template>
