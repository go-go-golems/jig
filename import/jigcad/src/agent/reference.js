// The lab reference as the agent and the Reference view get it: src/agent/reference.md with its scope table
// rendered from the registry (docs.js).
import md from './reference.md';
import { renderReference } from './docs.js';

export const reference = renderReference(md);
export default reference;
