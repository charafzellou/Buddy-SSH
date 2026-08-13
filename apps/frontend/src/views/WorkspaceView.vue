<script setup lang="ts">
import type { BuddySshMessage, KbdInteractiveChallenge } from '@buddy-ssh/shared'
import { computed, onUnmounted, ref } from 'vue'
import AuthPrompt from '@/components/connect/AuthPrompt.vue'
import HostKeyMismatchWarning from '@/components/connect/HostKeyMismatchWarning.vue'
import HostKeyPrompt from '@/components/connect/HostKeyPrompt.vue'
import type { QuickConnectAuthMethod } from '@/components/connect/QuickConnectDialog.vue'
import QuickConnectDialog from '@/components/connect/QuickConnectDialog.vue'
import AppShell from '@/components/layout/AppShell.vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import TabBar from '@/components/layout/TabBar.vue'
import ProfileEditor from '@/components/profiles/ProfileEditor.vue'
import ProfileList from '@/components/profiles/ProfileList.vue'
import TerminalPane from '@/components/terminal/TerminalPane.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import type { PublicKeySubmission } from '@/services/authSubmission'
import { sendPublicKeyAuth } from '@/services/authSubmission'
import type { Profile } from '@/services/storage'
import { WebSocketTransport } from '@/services/transport'
import { useKnownHostsStore } from '@/stores/useKnownHostsStore'
import { useProfileStore } from '@/stores/useProfileStore'
import { useSessionStore } from '@/stores/useSessionStore'

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
  authMethod: QuickConnectAuthMethod
  password?: string
  profileId?: string
}

interface AuthPromptState {
  tabId: string
  mode: 'publickey' | 'kbdInteractive'
  challenge?: KbdInteractiveChallenge
}

interface HostKeyPromptState {
  tabId: string
  host: string
  algorithm: string
  fingerprint: string
}

interface HostKeyMismatchState {
  tabId: string
  host: string
  algorithm: string
  oldFingerprint: string
  newFingerprint: string
}

interface ConnectContext {
  host: string
  port: number
  wasPinned: boolean
}

interface QuickConnectPrefill {
  destination: string
  authMethod: QuickConnectAuthMethod
  profileId?: string
  profileLabel?: string
}

const isQuickConnectOpen = ref(false)
const quickConnectPrefill = ref<QuickConnectPrefill | null>(null)
const isProfileEditorOpen = ref(false)
const editingProfile = ref<Profile | null>(null)
const authPromptState = ref<AuthPromptState | null>(null)
const hostKeyPromptState = ref<HostKeyPromptState | null>(null)
const hostKeyMismatchState = ref<HostKeyMismatchState | null>(null)
const pendingPublicKeyResolvers = new Map<
  string,
  { resolve: (submission: PublicKeySubmission) => void; reject: (error: Error) => void }
>()
const connectContexts = new Map<string, ConnectContext>()
const tabConnectionInfo = new Map<
  string,
  { host: string; port: number; username: string; authMethod: QuickConnectAuthMethod }
>()
const latencyByTab = ref<Record<string, number | null>>({})
const pingTimers = new Map<string, number>()
const sessionStore = useSessionStore()
const knownHostsStore = useKnownHostsStore()
const profileStore = useProfileStore()

const transportToken = (import.meta.env.VITE_BUDDY_SSH_TOKEN ?? 'dev-token').trim() || 'dev-token'
const activeLatency = computed(() => {
  if (!sessionStore.activeTabId) {
    return null
  }

  return latencyByTab.value[sessionStore.activeTabId] ?? null
})

function handleConnect(payload: QuickConnectPayload): void {
  tabConnectionInfo.set(payload.tabId, {
    host: payload.host,
    port: payload.port,
    username: payload.username,
    authMethod: payload.authMethod,
  })

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

function handleProfileConnect(profile: Profile): void {
  quickConnectPrefill.value = {
    destination: `${profile.username}@${profile.host}:${profile.port}`,
    authMethod: profile.authType,
    profileId: profile.id,
    profileLabel: profile.nickname,
  }
  isQuickConnectOpen.value = true
}

function handleProfileEdit(profile: Profile): void {
  editingProfile.value = profile
  isProfileEditorOpen.value = true
}

function handleNewProfile(): void {
  editingProfile.value = null
  isProfileEditorOpen.value = true
}

function handleSaveActiveSessionAsProfile(): void {
  const tabId = sessionStore.activeTabId
  if (!tabId) {
    return
  }

  const info = tabConnectionInfo.get(tabId)
  if (!info) {
    return
  }

  editingProfile.value = {
    id: '',
    nickname: sessionStore.activeTab?.label ?? `${info.username}@${info.host}`,
    host: info.host,
    port: info.port,
    username: info.username,
    authType: info.authMethod,
    tags: [],
    terminalPrefs: {},
    connectionPrefs: {},
    createdAt: 0,
    updatedAt: 0,
  }
  isProfileEditorOpen.value = true
}

function handleProfileSave(profile: Profile): void {
  void profileStore.save(profile)
}

function handleQuickConnectOpenChange(open: boolean): void {
  isQuickConnectOpen.value = open
  if (!open) {
    quickConnectPrefill.value = null
  }
}

// The interim known-hosts key (crypto/interimKnownHostsKey.ts) is
// regenerated per page session, so a record pinned before the last reload
// can no longer be decrypted — decrypt throws, indistinguishable from real
// tampering. Falling back to "unknown" (first-use) here is the right
// interim behavior: refusing to connect would be a dead end (the record
// can never be decrypted again until M6 adds a real persistent key), while
// first-use lets the user re-verify and re-pin, self-healing.
async function lookupKnownHost(hostKey: string): ReturnType<typeof knownHostsStore.lookup> {
  try {
    return await knownHostsStore.lookup(hostKey)
  } catch {
    return null
  }
}

async function openSession(
  payload: QuickConnectPayload,
  transport: WebSocketTransport,
): Promise<void> {
  try {
    const hostKey = `${payload.host}:${payload.port}`
    const pinned = await lookupKnownHost(hostKey)
    connectContexts.set(payload.tabId, {
      host: hostKey,
      port: payload.port,
      wasPinned: pinned !== null,
    })

    await transport.connect()
    transport.send({
      v: 1,
      id: createMessageID(),
      type: 'INIT',
      payload: {
        authMethod: payload.authMethod,
        hostKey: pinned
          ? { mode: 'pinned', fingerprint: pinned.fingerprint, algorithm: pinned.algorithm }
          : { mode: 'first-use' },
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

    if (payload.authMethod === 'publickey') {
      const submission = await requestPublicKey(payload.tabId)
      sendPublicKeyAuth(transport.send.bind(transport), createMessageID, submission)
    } else if (payload.authMethod === 'keyboard-interactive') {
      // No credential is sent upfront: the real challenge only arrives
      // (via STATUS.challenge) once CONNECT triggers the dial, handled
      // reactively in handleStatusMessage below.
      transport.send({
        v: 1,
        id: createMessageID(),
        type: 'AUTH',
        payload: {},
      })
    } else {
      transport.send({
        v: 1,
        id: createMessageID(),
        type: 'AUTH',
        payload: {
          password: payload.password,
        },
      })
    }

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

function requestPublicKey(tabId: string): Promise<PublicKeySubmission> {
  return new Promise((resolve, reject) => {
    authPromptState.value = { tabId, mode: 'publickey' }
    pendingPublicKeyResolvers.set(tabId, { resolve, reject })
  })
}

function handleAuthPromptSubmitKey(submission: PublicKeySubmission): void {
  const tabId = authPromptState.value?.tabId
  authPromptState.value = null
  if (!tabId) {
    return
  }

  const pending = pendingPublicKeyResolvers.get(tabId)
  pendingPublicKeyResolvers.delete(tabId)
  pending?.resolve(submission)
}

function handleAuthPromptCancel(): void {
  const tabId = authPromptState.value?.tabId
  const mode = authPromptState.value?.mode
  authPromptState.value = null
  if (!tabId) {
    return
  }

  const pending = pendingPublicKeyResolvers.get(tabId)
  pendingPublicKeyResolvers.delete(tabId)
  pending?.reject(new Error('Authentication cancelled'))

  if (mode === 'kbdInteractive') {
    // The backend's challenge callback is blocked waiting for a response
    // (no idle-timeout tracking exists yet mid-handshake); closing the
    // transport cancels its context so it doesn't hang indefinitely.
    sessionStore.tabs.find((tab) => tab.id === tabId)?.transport?.close()
  }
}

function handleAuthPromptSubmitResponses(payload: { responses: string[] }): void {
  const tabId = authPromptState.value?.tabId
  authPromptState.value = null
  if (!tabId) {
    return
  }

  const transport = sessionStore.tabs.find((tab) => tab.id === tabId)?.transport
  transport?.send({
    v: 1,
    id: createMessageID(),
    type: 'AUTH',
    payload: {
      kbdInteractive: {
        challengeId: 'challenge',
        responses: payload.responses,
      },
    },
  })
}

function handleHostKeyPromptAccept(): void {
  const state = hostKeyPromptState.value
  hostKeyPromptState.value = null
  if (!state) {
    return
  }

  void knownHostsStore.pin(state.host, state.algorithm, state.fingerprint)
}

function handleHostKeyPromptReject(): void {
  const state = hostKeyPromptState.value
  hostKeyPromptState.value = null
  if (!state) {
    return
  }

  sessionStore.tabs.find((tab) => tab.id === state.tabId)?.transport?.close()
}

function handleHostKeyMismatchRepin(): void {
  const state = hostKeyMismatchState.value
  hostKeyMismatchState.value = null
  if (!state) {
    return
  }

  // The backend already closed this connection (host-key mismatch is
  // fatal for the in-flight session) and credentials aren't persisted to
  // silently retry with, so this only updates the pinned record for the
  // *next* connection attempt (Quick Connect / reconnect shortcut) rather
  // than reconnecting automatically.
  void knownHostsStore.pin(state.host, state.algorithm, state.newFingerprint)
}

function handleHostKeyMismatchAbort(): void {
  const state = hostKeyMismatchState.value
  hostKeyMismatchState.value = null
  if (!state) {
    return
  }

  sessionStore.tabs.find((tab) => tab.id === state.tabId)?.transport?.close()
}

// The backend's ERROR{HOST_KEY_MISMATCH} message only carries free text
// (`"host key mismatch for %s: got %s want %s"`, from hostkey.go) — no
// structured field for the newly presented fingerprint. Parsed here rather
// than extending the ERROR payload again on top of M3.2.2's STATUS.challenge
// addition.
const hostKeyMismatchPattern = /got (\S+) want/

async function handleHostKeyMismatch(tabId: string, message: string): Promise<void> {
  const context = connectContexts.get(tabId)
  if (!context) {
    return
  }

  const match = message.match(hostKeyMismatchPattern)
  const newFingerprint = match?.[1] ?? 'unknown (see error message)'
  const pinned = await knownHostsStore.lookup(context.host)

  hostKeyMismatchState.value = {
    tabId,
    host: context.host,
    algorithm: pinned?.algorithm ?? 'unknown',
    oldFingerprint: pinned?.fingerprint ?? 'unknown',
    newFingerprint,
  }
}

function handleStatusMessage(
  tabId: string,
  transport: WebSocketTransport,
  message: StatusMessage,
): void {
  sessionStore.touchTab(tabId)

  switch (message.type) {
    case 'CONNECTED':
      sessionStore.setTabState(tabId, 'connected')
      sessionStore.setTabError(tabId, null)
      startLatencyProbe(tabId, transport)

      {
        const context = connectContexts.get(tabId)
        if (context && !context.wasPinned) {
          hostKeyPromptState.value = {
            tabId,
            host: context.host,
            algorithm: message.payload.hostKey.algorithm,
            fingerprint: message.payload.hostKey.fingerprint,
          }
        }
      }
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

      if (message.payload.challenge) {
        authPromptState.value = {
          tabId,
          mode: 'kbdInteractive',
          challenge: message.payload.challenge,
        }
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

  if (isProtocolError(error) && error.payload.code === 'HOST_KEY_MISMATCH') {
    void handleHostKeyMismatch(tabId, error.payload.message)
  }
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
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'ERROR' &&
    'payload' in error
  )
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

const shortcuts = useKeyboardShortcuts({
  newTab() {
    isQuickConnectOpen.value = true
  },
  closeActiveTab() {
    if (sessionStore.activeTabId) {
      sessionStore.closeTab(sessionStore.activeTabId)
    }
  },
  switchTab(direction) {
    const ids = sessionStore.tabs.map((tab) => tab.id)
    if (ids.length === 0) {
      return
    }

    const currentIndex = ids.indexOf(sessionStore.activeTabId ?? '')
    const delta = direction === 'next' ? 1 : -1
    const nextIndex = (currentIndex + delta + ids.length) % ids.length
    const nextId = ids[nextIndex]
    if (nextId) {
      sessionStore.setActive(nextId)
    }
  },
  switchTabByIndex(index) {
    const tab = sessionStore.tabs[index]
    if (tab) {
      sessionStore.setActive(tab.id)
    }
  },
  reconnectActiveTab() {
    if (sessionStore.activeTabId) {
      sessionStore.reconnect(sessionStore.activeTabId)
    }
  },
})

onUnmounted(() => {
  shortcuts.dispose()
  for (const handle of pingTimers.values()) {
    window.clearInterval(handle)
  }
  pingTimers.clear()
})
</script>

<template>
  <AppShell title="Buddy-SSH Workspace">
    <template #header>
      <div class="flex items-center gap-2">
        <button
          v-if="sessionStore.activeTabId && tabConnectionInfo.has(sessionStore.activeTabId)"
          class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-[var(--app-muted)] transition hover:border-sky-300 dark:border-slate-700"
          @click="handleSaveActiveSessionAsProfile"
        >
          Save as Profile
        </button>
        <button class="rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-300" @click="isQuickConnectOpen = true">
          Quick Connect
        </button>
      </div>
    </template>

    <template #sidebar>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">Sidebar</p>
            <h2 class="mt-2 text-lg font-semibold">Profiles</h2>
          </div>
          <button
            type="button"
            class="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-[var(--app-muted)] transition hover:border-sky-300 dark:border-slate-700"
            @click="handleNewProfile"
          >
            + New
          </button>
        </div>
        <ProfileList @connect="handleProfileConnect" @edit="handleProfileEdit" />
      </div>
    </template>

    <template #tabbar>
      <TabBar />
    </template>

    <div class="relative h-full min-h-0">
      <TerminalPane
        v-for="tab in sessionStore.tabs"
        :key="tab.id"
        class="absolute inset-0"
        :transport="tab.transport"
        :active="tab.id === sessionStore.activeTabId"
        v-show="tab.id === sessionStore.activeTabId"
      />
      <TerminalPane v-if="sessionStore.tabs.length === 0" :transport="null" />
    </div>

    <template #status>
	      <StatusBar :state="sessionStore.activeTab?.state ?? 'disconnected'" :latency="activeLatency" />
    </template>
  </AppShell>

  <QuickConnectDialog
    :open="isQuickConnectOpen"
    :initial-destination="quickConnectPrefill?.destination"
    :initial-auth-method="quickConnectPrefill?.authMethod"
    :profile-id="quickConnectPrefill?.profileId"
    :profile-label="quickConnectPrefill?.profileLabel"
    @connect="handleConnect"
    @update:open="handleQuickConnectOpenChange"
  />
  <ProfileEditor
    :open="isProfileEditorOpen"
    :profile="editingProfile"
    @save="handleProfileSave"
    @update:open="isProfileEditorOpen = $event"
  />
  <AuthPrompt
    :open="authPromptState !== null"
    :mode="authPromptState?.mode ?? 'publickey'"
    :challenge="authPromptState?.challenge"
    @submit-key="handleAuthPromptSubmitKey"
    @submit-responses="handleAuthPromptSubmitResponses"
    @cancel="handleAuthPromptCancel"
    @update:open="(open) => { if (!open) handleAuthPromptCancel() }"
  />
  <HostKeyPrompt
    :open="hostKeyPromptState !== null"
    :host="hostKeyPromptState?.host ?? ''"
    :algorithm="hostKeyPromptState?.algorithm ?? ''"
    :fingerprint="hostKeyPromptState?.fingerprint ?? ''"
    @accept="handleHostKeyPromptAccept"
    @reject="handleHostKeyPromptReject"
  />
  <HostKeyMismatchWarning
    :open="hostKeyMismatchState !== null"
    :host="hostKeyMismatchState?.host ?? ''"
    :algorithm="hostKeyMismatchState?.algorithm ?? ''"
    :old-fingerprint="hostKeyMismatchState?.oldFingerprint ?? ''"
    :new-fingerprint="hostKeyMismatchState?.newFingerprint ?? ''"
    @repin="handleHostKeyMismatchRepin"
    @abort="handleHostKeyMismatchAbort"
  />
</template>
