## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.

## 2025-05-19 - Pre-computed TF-IDF Vectors for Local RAG Search
**Learning:** Performing vector construction and text normalization inside loop passes over in-memory knowledge base records during RAG search causes high CPU overhead and unnecessary object allocations on every search query.
**Action:** Pre-compute sparse TF-IDF vectors and normalized keyword arrays during index seeding/building so search queries only perform fast vector inner products.

## 2026-03-31 - Pre-indexing In-Memory Search Metadata Sets
**Learning:** In-memory search methods (such as `searchStatute`) that tokenize object fields (titles, keywords) dynamically per query term incur heavy CPU and regex normalization overhead on every search request.
**Action:** Pre-compute reverse token index maps (`Map<string, Set<number>>`) for field metadata at initialization time, allowing search requests to perform O(1) set lookups instead of repeated string re-tokenization.
