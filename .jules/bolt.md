## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.

## 2025-05-19 - Pre-computed TF-IDF Vectors for Local RAG Search
**Learning:** Performing vector construction and text normalization inside loop passes over in-memory knowledge base records during RAG search causes high CPU overhead and unnecessary object allocations on every search query.
**Action:** Pre-compute sparse TF-IDF vectors and normalized keyword arrays during index seeding/building so search queries only perform fast vector inner products.

## 2026-03-30 - Single-Row Typed Array Allocation & CodeQL Loop Bounding
**Learning:** CodeQL static analysis flags dynamic array iteration loops over user-tainted strings unless string parameters are coerced to primitives (`String(str)`), sliced to a constant maximum length (`slice(0, 256)`), and loop guards explicitly enforce compound bounds (`i <= MAX_LEN`).
**Action:** Always combine typed array allocation optimizations ($O(\min(N, M))$ space) with explicit constant integer upper bounds (`i <= MAX_LEN`) in loop conditions for user-supplied string processing functions.
