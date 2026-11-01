# Changelog

## 2026-10-31

- Initial workspace created

## 2026-10-31

Decision: Option B (Go server) with Pi provider and lunaroute/glm-5.3-flash + deepseek-4.1-flash; tasks added

## 2026-10-31

Implemented jigcad serve: pkg/sample (+gepp, adapted from slop piworker), pkg/server (/api/sample SSE, tools, cancel, models, token, static/embed), cmd/jigcad; browser adapter src/host/sample-http.js; last-round answer note. Live agent turns through lunaroute on glm-5.3-flash and deepseek-4.1-flash, Ask mode and Stop verified (commits 4c6ba07, a7cb8e2)
