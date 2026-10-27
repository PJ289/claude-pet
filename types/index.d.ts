export type Mood =
  | 'idle'
  | 'working'
  | 'intense'
  | 'attention'
  | 'puzzled'
  | 'nod'
  | 'happy'
  | 'elated'
  | 'dizzy'
  | 'sleeping'
  | 'compacting'

// The session's context window, as last read: tokens in use, the window's
// size, the one over the other as a whole percentage, and the five-hour and
// seven-day rate-limit windows' use where the account has them.
export type ContextUsage = { percent: number; tokens: number; window: number; limitPercent?: number; weekPercent?: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-pet': {
      mood: Mood
      isHidden: boolean
      context: ContextUsage | null
      // What the laptop's terminal says the model is doing: `read`, `bash`,
      // `edit`, `web`, `agent`, ...; null between turns.
      activity: string | null
      // How many subagents run right now: one mini pet each.
      agents: number
      // Between 22:00 and 06:00 on the host's clock.
      isNight: boolean
    }
  }
}
