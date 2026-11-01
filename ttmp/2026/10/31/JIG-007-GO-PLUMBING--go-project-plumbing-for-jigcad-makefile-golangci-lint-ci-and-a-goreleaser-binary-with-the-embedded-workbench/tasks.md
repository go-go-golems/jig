# Tasks

## TODO

- [ ] Vault release roles (release-jig-builder, release-jig-publisher) in terraform/vault/github-actions/envs/k3s
- [ ] release.yaml calling the shared publisher workflow; remove release.disable; Homebrew decision
- [ ] Confirm the CI workflows on their first GitHub run

## Done

- [x] Makefile (web, build, build-bin, serve, test-go, test-js, lint, goreleaser)
- [x] golangci-lint pinned (v2.12.2), 0 issues
- [x] CI: go test; web build, JS tests, embedded binary smoke; lint
- [x] GoReleaser: embedded binary for linux/darwin × amd64/arm64, checked and snapshot-built
- [x] jigcad --version
