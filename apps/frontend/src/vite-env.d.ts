/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUDDY_SSH_TOKEN?: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
