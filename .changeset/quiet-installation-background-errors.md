---
'@firebase/installations': patch
'@firebase/performance': patch
'firebase': patch
---

Handle background registration and token refresh failures in `getId()` without logging console errors. Avoid an unhandled rejection in Performance token retrieval while preserving token updates and errors returned to callers.
