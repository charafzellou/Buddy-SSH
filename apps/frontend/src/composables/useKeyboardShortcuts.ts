export type TabSwitchDirection = 'next' | 'previous'

export interface KeyboardShortcutHandlers {
	newTab(): void
	closeActiveTab(): void
	switchTab(direction: TabSwitchDirection): void
	switchTabByIndex(index: number): void
	reconnectActiveTab(): void
}

export interface UseKeyboardShortcutsOptions {
	target?: EventTarget
}

export interface UseKeyboardShortcutsHandle {
	dispose(): void
}

// useKeyboardShortcuts wires the global tab shortcuts (new/close/switch/
// reconnect) per FR-143. Ctrl and Cmd are treated interchangeably so the
// same bindings work on Windows/Linux and macOS.
export function useKeyboardShortcuts(
	handlers: KeyboardShortcutHandlers,
	options: UseKeyboardShortcutsOptions = {},
): UseKeyboardShortcutsHandle {
	const target = options.target ?? window

	function onKeydown(event: Event): void {
		const keyboardEvent = event as KeyboardEvent
		if (!(keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
			return
		}

		switch (keyboardEvent.key.toLowerCase()) {
			case 't':
				keyboardEvent.preventDefault()
				handlers.newTab()
				return
			case 'w':
				keyboardEvent.preventDefault()
				handlers.closeActiveTab()
				return
			case 'r':
				keyboardEvent.preventDefault()
				handlers.reconnectActiveTab()
				return
			case 'tab':
				keyboardEvent.preventDefault()
				handlers.switchTab(keyboardEvent.shiftKey ? 'previous' : 'next')
				return
			default: {
				const index = Number(keyboardEvent.key)
				if (Number.isInteger(index) && index >= 1 && index <= 9) {
					keyboardEvent.preventDefault()
					handlers.switchTabByIndex(index - 1)
				}
			}
		}
	}

	target.addEventListener('keydown', onKeydown)

	return {
		dispose() {
			target.removeEventListener('keydown', onKeydown)
		},
	}
}
