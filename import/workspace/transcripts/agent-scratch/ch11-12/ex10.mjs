import { sketch, c, deg } from './h.mjs';
const S = sketch('tri').polyline('t', [[0, 0], [40, 0], [40, 23.094]], { closed: true })
  .dim(['t.1', 't.2'], deg(90)).dim(['t.2', 't.3'], deg(60))
  .dim(['t.3', 't.1'], null, { driven: true }).solve({});
for (const cd of S.constraintData()) if (cd.driven || cd.kind === 'angle') console.log(cd.id, cd.kind, cd.value, cd.text, cd.driven);
