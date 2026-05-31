# 00-SHARED — Common Tools

Both the Hosting Deploy Engine and the Template AI Engine use these tools.
Never duplicate shared logic in either engine. Import from here.

## Files (target state)

| File | Purpose |
|---|---|
| `deploymentContext.js` | The shared context "backpack" — factory + validators |
| `deploymentRecordStore.js` | Create/update/query deployment records (wraps hostingStore) |
| `stageLogger.js` | Consistent start/success/fail log per stage |
| `stageErrors.js` | Standard error shapes: badRequest, stageError, serverError |
| `stageNames.js` | Enum of every stage name used across both engines |
| `fileRules.js` | ZIP ignore list, max sizes, unsafe extensions |
| `githubCommon.js` | Token resolution, URL parsing, API header builder |
| `renderCommon.js` | Status normaliser, payload helpers, liveUrl extractor |
| `runtimeConfig.js` | Env var resolution — RENDER_*, GITHUB_*, DATA_DIR |

## Migration status

- [ ] deploymentRecordStore.js   (source: services/deploymentRecordStore.js)
- [ ] runtimeConfig.js           (source: services/runtimeConfig.js)
- [ ] stageLogger.js             (new)
- [ ] stageErrors.js             (new — consolidates error factories)
- [ ] stageNames.js              (new)
- [ ] deploymentContext.js       (new — shared context factory)
- [ ] fileRules.js               (new — consolidates ignore rules from zip services)
- [ ] githubCommon.js            (new — consolidates token/URL helpers)
- [ ] renderCommon.js            (new — consolidates render helpers)
