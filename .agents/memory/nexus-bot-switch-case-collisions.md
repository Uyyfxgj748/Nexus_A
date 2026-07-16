---
name: Nexus-Bot command switch — duplicate case labels
description: A duplicate `case` string across two command groups silently shadows the second one; JS switch takes the first match.
---

- `handler.js`'s big command switch had `case 'play':` used both as a tic-tac-toe "move" alias (`case 't': case 'jugar': case 'play': ...`) and, further down, as the real YouTube-audio downloader (`case 'play': case 'ytaudio': case 'mp3':`). JS `switch` matches the first case label textually equal to the value and runs *that* block — the second (later) `case 'play':` block became dead code, so `#play` always ran the tic-tac-toe handler instead of downloading audio.
  **Why:** easy to introduce when aliases are added ad hoc across far-apart sections of a large switch; nothing errors at parse time or runtime, it just silently executes the wrong branch.
  **How to apply:** when adding a new command alias to this switch (or any large switch with many `case 'x': case 'y':` groups), grep the whole file for the exact string first (`grep -n "case 'name'"`) to confirm it isn't already claimed elsewhere, especially for short/generic words like "play", "t", "s".
