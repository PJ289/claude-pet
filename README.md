# pixel-pet

A tiny pixel-art pet for Claude Code. It lives in a thin strip just above the prompt box, so you don't need a side panel or an extra window. It's an orange, Claude-style critter that reacts to the session:

| Mood | When | What it does |
| --- | --- | --- |
| idle | nothing is running | stands on its spot, breathing, blinking, glancing at the prompt |
| working | a turn is running | the mascot's own routine: pulls out a laptop, hops, and types, a small terminal window filling up above the laptop |
| intense | a turn has run for over a minute | the same, frantic: faster keys, a sweat drop, the terminal racing |
| happy | a turn has just finished with an answer | a real jump, crouch, stretch and land, with confetti |
| dizzy | a turn was interrupted or failed | shakes its head |
| sleeping | nothing has happened for 5 minutes | sits down, shuts its eyes and snores |

It stands at the left end of the strip, on a floor line, with a shadow under it.

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
- `hooks/desktop.ts`: the SMIL-animated SVG for the desktop app
- `hooks/terminal.ts`: the walker and the half-block Raster encoding for the terminal
- `types/index.d.ts`: the session state contract (`mood`, `isHidden`)

## License

MIT
