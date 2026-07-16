---
name: Gacha pool query & selection rules
description: _normTag parentheses, query ordering, and pool selection strategy for buscarImagenPersonajeConFallback
---

## Rules

### 1. _normTag must preserve parentheses
`_normTag` uses `[^\w_:()]` — parentheses are kept.
Without this, `ram_(re_zero)` → `ram_re_zero` (invalid tag, 0 booru results), causing cascade to fall through to the bare name "ram" which matches unrelated characters.

### 2. queries[] must be ordered most-specific → most-generic
Current order (SFW and NSFW both):
1. `nombre+serie` AND-tag (e.g. `"ram re:zero"`) — works on all boorus as AND
2. Exact DB tag (e.g. `"ram_(re_zero)"`) — works on boorus using underscore notation
3. `nombre` alone (e.g. `"ram"`)
4. aliases
5. tag without serie suffix
6. first name only (last resort)

Previously `nombre` was second (before the AND-tag), so cascade hit the bare name before the precise query.

### 3. Pool selection: first-by-priority, not most-images
`pools[0]` — first source in `fuentes[]` order that returned results.
`Promise.allSettled` + `filter` preserve the `fuentes[]` order, so `pools[0]` is always the highest-priority source with results.

Previously used `pools.reduce((a,b) => a.urls.length >= b.urls.length ? a : b)` — a lower-priority source with 200 noisy results beat a higher-priority source with 10 correct ones.

**Why:** Booru sources have a natural quality/precision order (safebooru > danbooru-sfw for SFW; gelbooru > rule34 for NSFW). Picking the first that succeeded respects this order without needing per-source tuning.

**How to apply:** Any new source added to `sfwSources` or `nsfwSources` should be ordered by precision/trustworthiness, not coverage. Coverage is handled by the cascade inside each pool function.
