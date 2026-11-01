# The agent's eval in its own sandboxed worker with the engine, guard proxies, errors that teach, a docs registry and one result shape

This is the document workspace for ticket JIG-012-AGENT-SANDBOX.

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

- Add documents: `docmgr doc add --ticket JIG-012-AGENT-SANDBOX --doc-type design-doc --title "My Design"`
- Import sources: `docmgr import file --ticket JIG-012-AGENT-SANDBOX --file /path/to/doc.md`
- Update metadata: `docmgr meta update --ticket JIG-012-AGENT-SANDBOX --field Status --value review`
