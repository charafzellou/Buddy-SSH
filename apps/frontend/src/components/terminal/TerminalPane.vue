<script setup lang="ts">
import { useResize, type UseResizeHandle } from '@/composables/useResize'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useTerminal, type TerminalTransport, type UseTerminalHandle } from '@/composables/useTerminal'
import { useSettingsStore } from '@/stores/useSettingsStore'

const props = defineProps<{
	transport?: TerminalTransport | null
}>()

const pane = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const settings = useSettingsStore()

let terminalHandle: UseTerminalHandle | null = null
let resizeHandle: UseResizeHandle | null = null

const hasTransport = computed(() => props.transport != null)

watch(
	[() => pane.value, () => container.value, () => props.transport],
	([paneElement, element, transport], [, , previousTransport]) => {
		if (terminalHandle && (!paneElement || !element || !transport || transport !== previousTransport)) {
			terminalHandle.dispose()
			terminalHandle = null
			resizeHandle?.dispose()
			resizeHandle = null
		}

		if (!paneElement || !element || !transport || terminalHandle) {
			return
		}

		terminalHandle = useTerminal({
			container: element,
			transport,
			settings: {
				fontFamily: settings.fontFamily,
				fontSize: settings.fontSize,
				scrollback: settings.scrollback,
			},
		})
		resizeHandle = useResize({
			element: paneElement,
			transport,
			measure: () => {
				const dimensions = terminalHandle?.bundle.addons.fit.proposeDimensions()
				if (dimensions && terminalHandle) {
					const { terminal, addons } = terminalHandle.bundle
					if (dimensions.cols !== terminal.cols || dimensions.rows !== terminal.rows) {
						addons.fit.fit()
					}

					return {
						cols: dimensions.cols,
						rows: dimensions.rows,
						pixelWidth: element.clientWidth,
						pixelHeight: element.clientHeight,
					}
				}

				return {
					cols: terminalHandle?.bundle.terminal.cols ?? 80,
					rows: terminalHandle?.bundle.terminal.rows ?? 24,
					pixelWidth: element.clientWidth,
					pixelHeight: element.clientHeight,
				}
			},
		})
		element.focus()
	},
	{ immediate: true },
)

onUnmounted(() => {
	terminalHandle?.dispose()
	terminalHandle = null
	resizeHandle?.dispose()
	resizeHandle = null
})
</script>

<template>
	<div ref="pane" class="relative h-full min-h-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.35),_rgba(2,6,23,0.92))]">
		<div v-if="!hasTransport" class="flex h-full flex-col justify-between p-5">
			<div>
				<p class="text-xs uppercase tracking-[0.35em] text-sky-300/80">Terminal Pane</p>
				<h2 class="mt-3 text-xl font-semibold text-white">No active session yet</h2>
				<p class="mt-2 max-w-2xl text-sm text-slate-300">
					Open a quick-connect session to mount xterm.js and attach the websocket transport.
				</p>
			</div>

			<div class="mt-8 rounded-2xl border border-sky-400/20 bg-slate-950/70 p-4 font-mono text-sm text-slate-300">
				$ ssh ops@example.com
			</div>
		</div>

		<div v-else ref="container" tabindex="0" class="h-full min-h-0 w-full p-3 outline-none" />
	</div>
</template>