# pixel-pet

A tiny pixel-art pet for Claude Code. It lives in a thin strip just above the prompt box, so you don't need a side panel or an extra window. It's an orange, Claude-style critter that reacts to the session:

| Mood | When | What it does |
| --- | --- | --- |
| idle | nothing is running | stands on its spot, breathing, blinking, glancing at the prompt |
| working | a turn is running | the mascot's own routine: pulls out a laptop, hops, and types; the terminal window above the laptop names what Claude is doing (`read`, `bash`, `edit`, `web`, `agent`, ...) |
| intense | a turn has run for over a minute | the same, frantic: faster keys, a sweat drop, the terminal racing |
| attention | Claude is waiting on you: a permission, a question, a plan to approve | faces the prompt and bounces with a `?` over it, until the tool goes ahead |
| puzzled | a tool call failed | scratches its head for a moment, then back to typing |
| nod | a turn under 15 seconds finished | a nod and a blink |
| happy | a turn finished with an answer | a real jump, crouch, stretch and land, with confetti |
| elated | a turn over five minutes finished | higher, faster, twice the confetti |
| dizzy | a turn was interrupted or failed | shakes its head |
| sleeping | nothing has happened for 5 minutes | sits down, shuts its eyes and snores; at night, in a nightcap |
| compacting | the conversation is being compacted (`/compact` or automatic) | walks over to the in-tray, hops on and stomps the pile down, dust flying, until it is done |

While subagents run, a mini pet types beside the pile for each of them (three at most, then a count). Between 22:00 and 06:00 on the machine's clock the strip dims and a crescent moon hangs over the stage.

It stands at one end of the strip, on a floor line, with a shadow under it. Click it and it does one of five things at random: hops with a heart, spins right round, startles with a "!", dances to a note, or waves. Those reactions live inside the drawing (SMIL hears the click; the hit area is a band of stripes sliding across the stage, two per reaction, so the pick is luck), so they run in the desktop app only.

The session's context window shows twice. Beside the pet, an in-tray: a pile of papers that grows with the context, under a dashed line where 100% is; the sheets near the top turn amber past 70% and red past 90%, and past 90% the pile sways. At the other end of the strip, a meter: twenty cells and the percentage, in the same colours, and above it, where the account has them, the rate-limit windows: the five-hour one as a battery, the week as seven cells, one per day. All of it is read off the session when it starts, after each tool call, at the end of each turn and after a compaction. The terminal draws the meter in block characters.

## Options

In `/config` (or `pluginConfigs` in settings) the plugin has four rows: **Size** (3 or 4 pixels per art pixel), **Side** (which end of the strip the pet stands at), **Context meter** and **Paper pile** (on or off). A change reloads the pet with the new look.

It draws on two surfaces:

- **Claude desktop app**: an animated SVG. The animation runs in the app itself, so it needs no redraws.
- **Terminal**: a 6-row strip of half-block pixels (the same frames, no shadow), repainted about 7 times a second.

The engine's `[-]` mark next to the strip collapses it. `/pet hide` and `/pet show` (or `/pet` to toggle) hide or show it, and that setting carries over to future sessions. `/pet demo` plays every mood for a few seconds each, `/pet mood <name>` pins one until `/pet mood auto`, and `/pet status` says where it is drawn.

## Install

The pet runs wherever Claude Code itself runs, so it has to be installed on that machine.

### Local sessions (desktop app and terminal)

In the desktop app, click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PJ289/claude-pet`, then **Add plugin** → `pixel-pet`.

Or, from a terminal session:

```
/plugin install pixel-pet --marketplace PJ289/claude-pet
```

or from a shell:

```
claude plugin install pixel-pet --marketplace PJ289/claude-pet
```

Answer `y` to add the marketplace and pick the **user** scope, so the pet shows up in every local session, including the ones the desktop app starts.

### SSH sessions

An SSH session runs Claude Code on the remote host, so the plugin loads from that host's `~/.claude`. Install it there once with the same shell command:

```
ssh my-host 'claude plugin install pixel-pet --marketplace PJ289/claude-pet'
```

### Cloud sessions

A cloud session (claude.ai/code, or a cloud session opened from the desktop app) runs the plugin in its container, but the app watching it does not attach as a drawing surface, so nothing is drawn there. `/pet status` shows this as `Surfaces: none`. The plugin still loads there if the repository's `.claude/settings.json` enables it, and the pet will show up once remote clients draw mod UI:

```json
{
  "extraKnownMarketplaces": {
    "pixel-pet": { "source": { "source": "github", "repo": "PJ289/claude-pet" } }
  },
  "enabledPlugins": { "pixel-pet@pixel-pet": true }
}
```

### Private repository

While `PJ289/claude-pet` is private, installing needs a git credential for github.com on the machine (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.

## Troubleshooting

`/pet status` lists the surfaces the session draws on and when the band was last drawn. If it says `Surfaces: none`, the app showing the session is not drawing mod UI there.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # run a session with the pet loaded from this folder
```

- `hooks/register.tsx`: the hooks (moods, the `/pet` command, drawing the band)
- `hooks/frames.ts`: the pixel art, traced from Claude's mascot, one character per pixel
- `types/index.d.ts`: the session state contract (`mood`, `isHidden`, `context`, `activity`, `agents`, `isNight`)
- `hooks/desktop.ts`: the SMIL-animated SVG for the desktop app
- `hooks/terminal.ts`: the walker and the half-block Raster encoding for the terminal

## License

MIT
