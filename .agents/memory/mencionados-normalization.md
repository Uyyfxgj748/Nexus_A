---
name: Mencionados normalization
description: ctxInfoMsg.participant (quoted-reply sender) has :N@ device suffix that must be stripped before use as targetJid.
---

## Rule
Always normalize JIDs from `ctxInfoMsg.participant` with `.replace(/:\d+@/, '@')` and `resolverJid()` before using them as target JIDs. Filter out group JIDs (`@g.us`, `@broadcast`).

**Why:** When replying to own message, `ctxInfoMsg.participant` includes a device suffix like `123@s.whatsapp.net:1`. Without normalization, this creates a duplicate profile separate from the real `123@s.whatsapp.net` profile. This caused #darcoins to create a bot-self profile when the owner replied to their own message.

## How to apply
In `src/handler.js` (around the mencionados extraction block):
```js
let mencionados = (ctxInfoMsg.mentionedJid || [])
    .map(j => resolverJid(j.replace(/:\d+@/, '@')))
    .filter(j => j && !j.endsWith('@g.us') && !j.endsWith('@broadcast'));
if (!mencionados.length && ctxInfoMsg.participant) {
    const rawP = ctxInfoMsg.participant.replace(/:\d+@/, '@');
    const resolvedP = resolverJid(rawP);
    if (resolvedP && !resolvedP.endsWith('@g.us')) mencionados = [resolvedP];
}
```
Apply the same pattern anywhere a quoted-reply participant is used as a targetJid.
