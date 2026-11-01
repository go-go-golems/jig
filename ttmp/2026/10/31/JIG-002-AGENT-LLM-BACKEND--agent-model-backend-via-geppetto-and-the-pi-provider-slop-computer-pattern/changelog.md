# Changelog

## 2026-10-31

- Initial workspace created

## 2026-10-31

Decision: Option B (Go server) with Pi provider and lunaroute/glm-5.3-flash + deepseek-4.1-flash; tasks added

## 2026-10-31

Implemented jigcad serve: pkg/sample (+gepp, adapted from slop piworker), pkg/server (/api/sample SSE, tools, cancel, models, token, static/embed), cmd/jigcad; browser adapter src/host/sample-http.js; last-round answer note. Live agent turns through lunaroute on glm-5.3-flash and deepseek-4.1-flash, Ask mode and Stop verified (commits 4c6ba07, a7cb8e2)

## 2026-10-31

Vault report 3 written and pushed (go-go-parc 084bf51): PROJECT REPORT - jigcad - A Go Model Backend for the Workbench Agent; ticket complete

## 2026-10-31

Measured prompt caching through lunaroute: 94–99% cache reads from round 2, 88% on a real 8-tool turn; cache is per model and per session. Server log now reports cacheRead/cacheWrite; corrected the 'no prompt caching' claim
