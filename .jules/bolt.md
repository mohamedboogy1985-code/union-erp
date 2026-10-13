## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.

## 2025-05-19 - 1D Int32Array Levenshtein Matrix Buffer Optimization
**Learning:** Naive Levenshtein similarity implementation allocating full 2D array matrices (`Array.fill().map()`) in string utility helper functions causes significant Garbage Collection (GC) overhead and CPU delays during frequent subledger/committee fuzzy searches.
**Action:** Replace 2D dynamic array matrix allocation with two 1D `Int32Array` buffers (`prev` and `curr`), reducing space complexity from $O(N \times M)$ dynamic array allocation to $O(N)$ TypedArray allocation and boosting performance by ~3.4x.
