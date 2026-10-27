# pixel-pet

A tiny pixel-art pet for Claude Code. It lives in a thin strip just above the prompt box, so you don't need a side panel or an extra window. It's an orange, Claude-style critter that reacts to the session:

| Mood | When | What it does |
| --- | --- | --- |
| idle | nothing is running | wanders back and forth, stops now and then, blinks |
| working | a turn is running or a tool is being called | trots faster, with a spinning spark |
| happy | a turn has just finished with an answer | waves its arms for a few seconds |
| sleeping | nothing has happened for 5 minutes | sits down and snores `z z Z` |

It draws on two surfaces:

- **Claude desktop app**: an animated SVG. The animation runs in the app itself, so it needs no redraws.
- **Terminal**: a 3-row strip of half-block pixels, repainted about 7 times a second.

The engine's `[-]` mark next to the strip collapses it. `/pet hide` and `/pet show` (or `/pet` to toggle) hide or show it, and that setting carries over to future sessions.

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

### Cloud sessions (claude.ai/code and the desktop app's cloud sessions)

A cloud session starts from a fresh container, so it loads plugins from the repository's project settings. Add this to `.claude/settings.json` in each repository where you want the pet:

```json
{
  "extraKnownMarketplaces": {
    "pixel-pet": { "source": { "source": "github", "repo": "PJ289/claude-pet" } }
  },
  "enabledPlugins": { "pixel-pet@pixel-pet": true }
}
```

Those same lines also turn the pet on for anyone who opens that repository locally or over SSH. Another option is to add the shell install command to the cloud environment's setup script.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # run a session with the pet loaded from this folder
```

- `hooks/register.tsx`: the hooks (moods, the `/pet` command, drawing the band)
- `hooks/sprites.ts`: the 11×6 pixel art
- `hooks/desktop.ts`: the SMIL-animated SVG for the desktop app
- `hooks/terminal.ts`: the walker and the half-block Raster encoding for the terminal
- `types/index.d.ts`: the session state contract (`mood`, `isHidden`)

## License

MIT
