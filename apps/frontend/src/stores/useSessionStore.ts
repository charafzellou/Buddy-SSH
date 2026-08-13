import type { WebSocketTransport } from '@/services/transport'
import type { StatusPayload } from '@buddy-ssh/shared'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type SessionTransport = Pick<
  WebSocketTransport,
  'close' | 'connect' | 'onData' | 'onError' | 'onStatus' | 'send'
>

export interface SessionTab {
  id: string
  profileId?: string
  label: string
  color?: string
  pinned: boolean
  state: StatusPayload['state']
  transport: SessionTransport | null
  error: string | null
  lastActivity: number
}

export interface OpenTabInput {
  profileId?: string
  label?: string
  color?: string
  state?: StatusPayload['state']
  transport?: SessionTransport | null
  error?: string | null
}

export const useSessionStore = defineStore('session', () => {
  const tabs = ref<SessionTab[]>([])
  const activeTabId = ref<string | null>(null)

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)

  function updateTab(id: string, apply: (tab: SessionTab) => void): void {
    const tab = tabs.value.find((candidate) => candidate.id === id)
    if (!tab) {
      return
    }

    apply(tab)
  }

  function openTab(input: OpenTabInput = {}): SessionTab {
    const tab: SessionTab = {
      id: createTabID(),
      profileId: input.profileId,
      label: input.label?.trim() || 'New Session',
      color: input.color,
      pinned: false,
      state: input.state ?? 'connecting',
      transport: input.transport ?? null,
      error: input.error ?? null,
      lastActivity: Date.now(),
    }

    tabs.value.push(tab)
    activeTabId.value = tab.id

    return tab
  }

  function closeTab(id: string): void {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index < 0) {
      return
    }

    tabs.value[index]?.transport?.close()
    tabs.value.splice(index, 1)

    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[index]?.id ?? tabs.value[index - 1]?.id ?? null
    }
  }

  function setActive(id: string): void {
    if (!tabs.value.some((tab) => tab.id === id)) {
      return
    }

    activeTabId.value = id
  }

  function setTabTransport(id: string, transport: SessionTransport | null): void {
    updateTab(id, (tab) => {
      tab.transport = transport
      tab.lastActivity = Date.now()
    })
  }

  function setTabState(id: string, state: StatusPayload['state']): void {
    updateTab(id, (tab) => {
      tab.state = state
      tab.lastActivity = Date.now()
    })
  }

  function setTabError(id: string, error: string | null): void {
    updateTab(id, (tab) => {
      tab.error = error
      tab.lastActivity = Date.now()
    })
  }

  function touchTab(id: string, timestamp = Date.now()): void {
    updateTab(id, (tab) => {
      tab.lastActivity = timestamp
    })
  }

  function renameTab(id: string, label: string): void {
    updateTab(id, (tab) => {
      tab.label = label.trim() || 'New Session'
      tab.lastActivity = Date.now()
    })
  }

  function pinTab(id: string, pinned?: boolean): void {
    updateTab(id, (tab) => {
      tab.pinned = pinned ?? !tab.pinned
    })
  }

  function duplicateTab(id: string): SessionTab | null {
    const source = tabs.value.find((tab) => tab.id === id)
    if (!source) {
      return null
    }

    return openTab({
      profileId: source.profileId,
      label: source.label,
      color: source.color,
    })
  }

  // reconnect/reconnectAll only reset tab state and re-open the transport's
  // underlying websocket pipe (if one exists); they cannot replay the
  // INIT/AUTH/CONNECT handshake since credentials are never persisted here
  // (no backend secret storage principle). Re-running that handshake is the
  // caller's responsibility (e.g. a keyboard shortcut invoking the same
  // connect flow used for quick connect).
  function reconnect(id: string): void {
    const tab = tabs.value.find((candidate) => candidate.id === id)
    if (!tab) {
      return
    }

    tab.state = 'connecting'
    tab.error = null
    tab.lastActivity = Date.now()

    tab.transport?.connect().catch((error: unknown) => {
      setTabError(id, error instanceof Error ? error.message : 'Reconnect failed')
      setTabState(id, 'error')
    })
  }

  function reconnectAll(): void {
    for (const tab of tabs.value) {
      reconnect(tab.id)
    }
  }

  function reorder(ids: string[]): void {
    const byId = new Map(tabs.value.map((tab) => [tab.id, tab]))
    const reordered: SessionTab[] = []

    for (const id of ids) {
      const tab = byId.get(id)
      if (tab) {
        reordered.push(tab)
        byId.delete(id)
      }
    }

    reordered.push(...byId.values())
    tabs.value = reordered
  }

  return {
    activeTab,
    activeTabId,
    closeTab,
    duplicateTab,
    openTab,
    pinTab,
    reconnect,
    reconnectAll,
    renameTab,
    reorder,
    setTabError,
    setTabState,
    setTabTransport,
    setActive,
    touchTab,
    tabs,
  }
})

function createTabID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `tab-${Math.random().toString(36).slice(2, 10)}`
}
