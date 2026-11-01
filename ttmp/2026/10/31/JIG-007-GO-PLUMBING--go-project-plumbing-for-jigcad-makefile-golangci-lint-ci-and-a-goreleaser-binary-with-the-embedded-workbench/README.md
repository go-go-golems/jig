# Go project plumbing for jigcad: Makefile, golangci-lint, CI and a GoReleaser binary with the embedded workbench

This is the document workspace for ticket JIG-007-GO-PLUMBING.

## Structure

- **design/**: Design documents and architecture notes
- **reference/**: Reference documentation and API contracts
- **playbooks/**: Operational playbooks and procedures
- **scripts/**: Utility scripts and automation
- **sources/**: External sources and imported documents
- **various/**: Scratch or meeting notes, working notes
- **archive/**: Optional space for deprecated or reference-only artifacts

## Getting Started

Use docmgr commands to manage this workspace:

- Add documents: `docmgr doc add --ticket JIG-007-GO-PLUMBING --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket JIG-007-GO-PLUMBING --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket JIG-007-GO-PLUMBING --field Status --value review`
