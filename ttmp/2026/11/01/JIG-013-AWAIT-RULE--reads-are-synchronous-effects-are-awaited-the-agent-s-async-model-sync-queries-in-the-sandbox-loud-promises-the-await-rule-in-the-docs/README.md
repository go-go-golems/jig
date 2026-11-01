# Reads are synchronous, effects are awaited: the agent's async model (sync queries in the sandbox, loud promises, the await rule in the docs)

This is the document workspace for ticket JIG-013-AWAIT-RULE.

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

- Add documents: `docmgr doc add --ticket JIG-013-AWAIT-RULE --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket JIG-013-AWAIT-RULE --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket JIG-013-AWAIT-RULE --field Status --value review`
