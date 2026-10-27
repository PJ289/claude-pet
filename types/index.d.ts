export type Mood = 'idle' | 'working' | 'intense' | 'happy' | 'dizzy' | 'sleeping'

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { mood: Mood; isHidden: boolean }
  }
}
