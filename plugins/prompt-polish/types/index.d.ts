export type PolishStatus = 'idle' | 'working' | 'done' | 'error'

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      status: PolishStatus
      note: string
      repo: string
      branch: string
      hasSession: boolean
      menuTick: number
    }
  }
}
