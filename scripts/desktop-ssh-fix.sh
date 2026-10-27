#!/bin/sh
# Completes the copy of pixel-pet that the Claude desktop app syncs to an SSH
# host: the app leaves out the plugin's hooks/ folder (the whole mod lives
# there), so the pet never loads in its SSH sessions. Run this on the host
# after the app has connected at least once; run it again if the app
# re-syncs and the pet goes missing. Takes the folder holding a full copy
# of the plugin (a clone of the repository), ~/claude-pet by default.
set -e
src="${1:-$HOME/claude-pet}"
test -f "$src/hooks/hooks.json" || { echo "No plugin at $src (expected hooks/hooks.json)"; exit 1; }
found=0
for d in "$HOME"/.claude/remote/plugins/*/*/; do
  if grep -q '"name": *"pixel-pet"' "$d/.claude-plugin/plugin.json" 2>/dev/null; then
    cp -r "$src/hooks" "$src/types" "$src/tsconfig.json" "$d"
    echo "Added hooks to $d"
    found=1
  fi
done
test "$found" = 1 || { echo "No synced copy of pixel-pet under ~/.claude/remote/plugins: open an SSH session from the desktop app first"; exit 1; }
echo "Done: start a new SSH session from the desktop app."
