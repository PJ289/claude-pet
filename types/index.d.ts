export type Mood = 'idle' | 'working' | 'rocket' | 'engineer' | 'happy' | 'sleeping'

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { mood: Mood; isHidden: boolean }
  }
}
