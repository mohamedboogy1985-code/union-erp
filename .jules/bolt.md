## 2025-05-18 - Pre-compiled RegExp and Memoization for TTS
**Learning:** Text-to-Speech normalization functions (`toSpokenArabic`) in Arabic voice assistant workflows are invoked frequently across UI renders and speech synthesis streams. Re-creating dynamic regular expressions on every transformation pass wastes memory and CPU cycles.
**Action:** Pre-compile regular expressions as top-level constants and use a bounded LRU cache (e.g. Map with cap) for idempotent text transformations.
