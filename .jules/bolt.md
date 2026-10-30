## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.

## 2025-05-19 - Pre-computed TF-IDF Vectors for Local RAG Search
**Learning:** Performing vector construction and text normalization inside loop passes over in-memory knowledge base records during RAG search causes high CPU overhead and unnecessary object allocations on every search query.
**Action:** Pre-compute sparse TF-IDF vectors and normalized keyword arrays during index seeding/building so search queries only perform fast vector inner products.

## 2026-03-30 - Single-Row Typed Array Allocation & CodeQL Loop Bounding
**Learning:** CodeQL static analysis flags dynamic array iteration loops over user-tainted strings unless string parameters are coerced to primitives (`String(str)`), sliced to a constant maximum length (`slice(0, 256)`), and loop guards explicitly enforce compound bounds (`i <= MAX_LEN`).
**Action:** Always combine typed array allocation optimizations ($O(\min(N, M))$ space) with explicit constant integer upper bounds (`i <= MAX_LEN`) in loop conditions for user-supplied string processing functions.

## 2026-03-31 - Module-Scoped Pre-Cleaned Keyword Arrays for Regulation Checks
**Learning:** Performing `String.replace()` inside array iteration helpers like `Array.prototype.some()` across multiple line items per journal entry leads to high CPU overhead and unnecessary string allocations during financial regulation checks.
**Action:** Pre-clean static keyword lists at module initialization and pass pre-normalized keyword arrays into matching helper functions.

## 2026-04-01 - Bounded Map LRU Caching for Server-Side Arabic Text Normalization
**Learning:** `normalizeArabicText` is called repeatedly across server-side search, entity matching, CSV importing, subledger party matching, and embedding vector generation. Running 7 sequential regex `.replace()` passes per invocation creates high CPU overhead and garbage collection pressure when processing repeated party or account queries.
**Action:** Wrap string normalization functions in a bounded `Map` LRU cache (e.g. 1,000 entries max) to provide $O(1)$ lookups for previously normalized strings.
