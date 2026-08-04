<script setup lang="ts">
import QuickConnectDialog from '@/components/connect/QuickConnectDialog.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import AppShell from '@/components/layout/AppShell.vue'
import TerminalPane from '@/components/terminal/TerminalPane.vue'
import { WebSocketTransport } from '@/services/transport'
import { useSessionStore } from '@/stores/useSessionStore'
import type { BuddySshMessage } from '@buddy-ssh/shared'
import { computed, onUnmounted, ref } from 'vue'

type StatusMessage = Extract<
  BuddySshMessage,
  { type: 'CONNECTED' | 'DISCONNECT' | 'KEEPALIVE' | 'PONG' | 'STATUS' }
>
type ErrorMessage = Extract<BuddySshMessage, { type: 'ERROR' }>

interface QuickConnectPayload {
  tabId: string
  username: string
  host: string
  port: number
  password: string
}

const isQuickConnectOpen = ref(false)
const latencyByTab = ref<Record<string, number | null>>({})
const pingTimers = new Map<string, number>()
const sessionStore = useSessionStore()

const transportToken = (import.meta.env.VITE_BUDDY_SSH_TOKEN ?? 'dev-token').trim() || 'dev-token'
const activeLatency = computed(() => {
  if (!sessionStore.activeTabId) {
    return null
  }

  return latencyByTab.value[sessionStore.activeTabId] ?? null
})

function handleConnect(payload: QuickConnectPayload): void {
  const transport = new WebSocketTransport({
    url: createWebSocketURL(),
    token: transportToken,
    encoding: 'msgpack',
  })

  sessionStore.setTabTransport(payload.tabId, transport)
  sessionStore.setTabState(payload.tabId, 'connecting')
  sessionStore.setTabError(payload.tabId, null)
  sessionStore.touchTab(payload.tabId)
  latencyByTab.value[payload.tabId] = null

  transport.onStatus = (message) => {
    handleStatusMessage(payload.tabId, transport, message)
  }
  transport.onError = (error) => {
    handleTransportError(payload.tabId, error)
  }

  void openSession(payload, transport)
}

async function openSession(payload: QuickConnectPayload, transport: WebSocketTransport): Promise<void> {
  try {
    await transport.connect()
    transport.send({
      v: 1,
      id: createMessageID(),
      type: 'INIT',
      payload: {
        authMethod: 'password',
        hostKey: { mode: 'first-use' },
        pty: {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        },
        target: {
          host: payload.host,
          port: payload.port,
          username: payload.username,
        },
      },
    })
    transport.send({
      v: 1,
      id: createMessageID(),
      type: 'AUTH',
      payload: {
        password: payload.password,
      },
    })
    transport.send({
      v: 1,
      id: createMessageID(),
      type: 'CONNECT',
      payload: {},
    })
  } catch (error) {
    handleTransportError(payload.tabId, error)
    transport.close()
  }
}

function handleStatusMessage(tabId: string, transport: WebSocketTransport, message: StatusMessage): void {
  sessionStore.touchTab(tabId)

  switch (message.type) {
    case 'CONNECTED':
      sessionStore.setTabState(tabId, 'connected')
      sessionStore.setTabError(tabId, null)
      startLatencyProbe(tabId, transport)
      return
    case 'DISCONNECT':
      stopLatencyProbe(tabId)
      latencyByTab.value[tabId] = null
      sessionStore.setTabState(tabId, 'disconnected')
      return
    case 'STATUS':
      sessionStore.setTabState(tabId, message.payload.state)
      if (message.payload.state === 'error') {
        sessionStore.setTabError(tabId, message.payload.message ?? 'SSH session failed')
      } else if (message.payload.state !== 'reconnecting') {
        sessionStore.setTabError(tabId, null)
      }

      if (message.payload.state !== 'connected') {
        stopLatencyProbe(tabId)
        if (message.payload.state !== 'connecting') {
          latencyByTab.value[tabId] = null
        }
      }
      return
    case 'PONG':
      latencyByTab.value[tabId] = Math.max(0, Math.round(Date.now() - message.payload.timestamp))
      return
    case 'KEEPALIVE':
      return
  }
}

function handleTransportError(tabId: string, error: Error | ErrorMessage | unknown): void {
  stopLatencyProbe(tabId)
  latencyByTab.value[tabId] = null
  sessionStore.setTabState(tabId, 'error')
  sessionStore.setTabError(tabId, transportErrorMessage(error))
  sessionStore.touchTab(tabId)
}

function startLatencyProbe(tabId: string, transport: WebSocketTransport): void {
  stopLatencyProbe(tabId)
  sendPing(transport)

  const handle = window.setInterval(() => {
    try {
      sendPing(transport)
    } catch {
      stopLatencyProbe(tabId)
    }
  }, 15_000)
  pingTimers.set(tabId, handle)
}

function stopLatencyProbe(tabId: string): void {
  const handle = pingTimers.get(tabId)
  if (handle == null) {
    return
  }

  window.clearInterval(handle)
  pingTimers.delete(tabId)
}

function sendPing(transport: WebSocketTransport): void {
  transport.send({
    v: 1,
    id: createMessageID(),
    type: 'PING',
    payload: {
      timestamp: Date.now(),
    },
  })
}

function transportErrorMessage(error: Error | ErrorMessage | unknown): string {
  if (isProtocolError(error)) {
    return error.payload.message
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return error.message
  }

  return 'Unable to establish the SSH session'
}

function isProtocolError(error: unknown): error is ErrorMessage {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === 'ERROR' && 'payload' in error
}

function createMessageID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `req-${Math.random().toString(36).slice(2, 10)}`
}

function createWebSocketURL(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

onUnmounted(() => {
  for (const handle of pingTimers.values()) {
    window.clearInterval(handle)
  }
  pingTimers.clear()
})
</script>

<template>
  <AppShell title="Buddy-SSH Workspace">
    <template #header>
      <button class="rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-300" @click="isQuickConnectOpen = true">
        Quick Connect
      </button>
    </template>

    <template #sidebar>
      <div class="space-y-4">
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Sidebar</p>
          <h2 class="mt-2 text-lg font-semibold">Profiles & Recents</h2>
        </div>
        <div class="rounded-2xl border border-dashed border-slate-300/70 p-4 text-sm text-[var(--app-muted)] dark:border-slate-700">
          Saved profiles, folders, and quick actions land here.
        </div>
      </div>
    </template>

    <template #tabbar>
      <div v-if="sessionStore.tabs.length > 0" class="flex flex-wrap items-center gap-3">
			<button
				v-for="tab in sessionStore.tabs"
				:key="tab.id"
				type="button"
				class="rounded-full border px-4 py-2 text-sm font-medium transition"
				:class="tab.id === sessionStore.activeTabId ? 'border-slate-950 bg-slate-950 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-slate-950' : 'border-slate-200 text-slate-600 hover:border-sky-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-300 dark:hover:text-white'"
				@click="sessionStore.setActive(tab.id)"
			>
				{{ tab.label }}
			</button>
		</div>
		<div v-else class="rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm text-[var(--app-muted)] dark:border-slate-700">
			Open a quick-connect session to start a terminal.
		</div>
    </template>

    <TerminalPane :transport="sessionStore.activeTab?.transport ?? null" />

    <template #status>
	      <StatusBar :state="sessionStore.activeTab?.state ?? 'disconnected'" :latency="activeLatency" />
    </template>
  </AppShell>

  <QuickConnectDialog v-model:open="isQuickConnectOpen" @connect="handleConnect" />
</template>
