<script setup lang="ts">
import type { KbdInteractiveChallenge } from '@buddy-ssh/shared'
import { computed, nextTick, ref, watch } from 'vue'
import type { PublicKeySubmission } from '@/services/authSubmission'
import { parseSshPrivateKey } from '@/utils/sshKeyParser'

export type AuthPromptMode = 'publickey' | 'kbdInteractive'

const props = defineProps<{
  open: boolean
  mode: AuthPromptMode
  challenge?: KbdInteractiveChallenge
}>()

const emit = defineEmits<{
  (event: 'submit-key', payload: PublicKeySubmission): void
  (event: 'submit-responses', payload: { responses: string[] }): void
  (event: 'cancel'): void
  (event: 'update:open', value: boolean): void
}>()

const keyText = ref('')
const passphrase = ref('')
const responses = ref<string[]>([])

watch(
  () => props.challenge,
  (challenge) => {
    responses.value = challenge ? challenge.prompts.map(() => '') : []
  },
  { immediate: true },
)

const parseResult = computed(() => {
  if (keyText.value.trim() === '') {
    return null
  }

  return parseSshPrivateKey(keyText.value, passphrase.value || undefined)
})

// For OpenSSH-format keys we can only detect "this key is encrypted", not
// verify a given passphrase is correct (no decrypt is attempted client-side
// — see sshKeyParser.ts). So once a key is detected as encrypted, submit is
// allowed as soon as a passphrase is typed; an actually-wrong passphrase is
// caught authoritatively by the backend's AUTH_FAILED response.
const needsPassphrase = computed(() => parseResult.value?.status === 'encrypted')
const keyError = computed(() =>
  parseResult.value?.status === 'invalid' ? parseResult.value.message : '',
)

const canSubmitKey = computed(
  () =>
    keyText.value.trim() !== '' &&
    keyError.value === '' &&
    !(needsPassphrase.value && passphrase.value === ''),
)

function readFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    keyText.value = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.readAsText(file)
}

function submitKey(): void {
  if (!canSubmitKey.value) {
    return
  }

  const encoder = new TextEncoder()
  const submission: PublicKeySubmission = {
    key: encoder.encode(keyText.value),
    passphrase: passphrase.value ? encoder.encode(passphrase.value) : undefined,
  }
  emit('submit-key', submission)

  keyText.value = ''
  passphrase.value = ''
}

async function submitResponses(): Promise<void> {
  emit('submit-responses', { responses: [...responses.value] })
  responses.value = responses.value.map(() => '')
  await nextTick()
}

function cancel(): void {
  keyText.value = ''
  passphrase.value = ''
  emit('cancel')
  emit('update:open', false)
}
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
		<div class="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white p-6 shadow-[0_30px_90px_rgba(2,6,23,0.25)] dark:bg-slate-950">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.3em] text-[var(--app-muted)]">
						{{ mode === 'publickey' ? 'Private Key' : 'Keyboard Interactive' }}
					</p>
					<h2 class="mt-2 text-2xl font-semibold">
						{{ mode === 'publickey' ? 'Authenticate with a key' : 'Additional verification required' }}
					</h2>
				</div>
				<button class="rounded-full px-3 py-1 text-sm text-[var(--app-muted)] transition hover:bg-slate-100 dark:hover:bg-slate-900" @click="cancel">
					Close
				</button>
			</div>

			<form v-if="mode === 'publickey'" class="mt-6 space-y-4" @submit.prevent="submitKey">
				<label class="block space-y-2">
					<span class="text-sm font-medium">Key file</span>
					<input
						type="file"
						accept=".pem,.key,text/plain"
						class="block w-full text-sm text-[var(--app-muted)]"
						@change="readFile"
					/>
				</label>

				<label class="block space-y-2">
					<span class="text-sm font-medium">Or paste key text</span>
					<textarea
						v-model="keyText"
						rows="6"
						placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900"
					/>
				</label>

				<label v-if="needsPassphrase" class="block space-y-2">
					<span class="text-sm font-medium">Passphrase</span>
					<input
						v-model="passphrase"
						type="password"
						placeholder="Key passphrase"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900"
					/>
				</label>

				<p v-if="keyError" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
					{{ keyError }}
				</p>

				<div class="flex justify-end gap-3 pt-2">
					<button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-[var(--app-muted)]" @click="cancel">
						Cancel
					</button>
					<button
						type="submit"
						:disabled="!canSubmitKey"
						class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Authenticate
					</button>
				</div>
			</form>

			<form v-else class="mt-6 space-y-4" @submit.prevent="submitResponses">
				<p v-if="challenge?.instructions" class="text-sm text-[var(--app-muted)]">
					{{ challenge.instructions }}
				</p>

				<label
					v-for="(prompt, index) in challenge?.prompts ?? []"
					:key="index"
					class="block space-y-2"
				>
					<span class="text-sm font-medium">{{ prompt.text }}</span>
					<input
						v-model="responses[index]"
						:type="prompt.echo ? 'text' : 'password'"
						class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-slate-800 dark:bg-slate-900"
					/>
				</label>

				<div class="flex justify-end gap-3 pt-2">
					<button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-[var(--app-muted)]" @click="cancel">
						Cancel
					</button>
					<button
						type="submit"
						class="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition hover:bg-sky-400"
					>
						Submit
					</button>
				</div>
			</form>
		</div>
	</div>
</template>
