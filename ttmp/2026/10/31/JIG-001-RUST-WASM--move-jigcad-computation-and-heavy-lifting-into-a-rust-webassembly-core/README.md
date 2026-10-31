# Move jigcad computation and heavy lifting into a Rust WebAssembly core

This is the document workspace for ticket JIG-001-RUST-WASM.

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

- Add documents: `docmgr doc add --ticket JIG-001-RUST-WASM --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket JIG-001-RUST-WASM --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket JIG-001-RUST-WASM --field Status --value review`
