export type Mood = 'idle' | 'working' | 'intense' | 'happy' | 'dizzy' | 'sleeping'

// The session's context window, as last read: tokens in use, the window's
// size, and the one over the other as a whole percentage.
export type ContextUsage = { percent: number; tokens: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': { mood: Mood; isHidden: boolean; context: ContextUsage | null }
  }
}
