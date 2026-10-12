## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.

## 2026-03-30 - Pre-computing TF-IDF Document Vectors for Local RAG Search
**Learning:** Local TF-IDF search (`EmbeddingService.searchLocal`) iterates through all seeded knowledge base documents and previously called `textToTfidfVector` and `normalizeArabicText` on every record for every single search query. Pre-calculating document vectors and normalized keywords once during `buildTfidfIndex()` reduced search latency by >92% (from 382ms to 28ms per 200 searches).
**Action:** Always pre-compute static document feature vectors during index creation rather than re-computing them dynamically in search iteration loops.
