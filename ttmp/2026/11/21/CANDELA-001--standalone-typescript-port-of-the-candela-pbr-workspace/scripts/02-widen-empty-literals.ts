// 02-widen-empty-literals.ts — codemod: give empty `[]` and `{}` literals a type JS code can grow.
//
// TypeScript infers `[]` as `never[]` and `{}` as `{}` when nothing gives them context, so `out.push(x)` or
// `o.foo = 1` / `o.foo` fail. For each empty literal whose type is exactly `never[]` / `{}`:
//   - initializer of an untyped parameter or variable → annotate the declaration (`o: Record<string, any> = {}`,
//     `const out: any[] = []`);
//   - anywhere else (object-literal properties, arguments, assignments) → cast (`[] as any[]`,
//     `{} as Record<string, any>`).
// Literals with a contextual type (e.g. assigned to a typed field) are left alone.
//
// Usage: npx tsx 02-widen-empty-literals.ts <tsconfig.json> <file.ts> [...]
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const [tsconfigPath, ...files] = process.argv.slice(2);
const cfg = ts.getParsedCommandLineOfConfigFile(path.resolve(tsconfigPath), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(String(d.messageText)); } })!;
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();

const ARR = 'any[]', OBJ = 'Record<string, any>';

for (const f of files) {
  const abs = path.resolve(f);
  const sf = program.getSourceFile(abs);
  if (!sf) { console.error('not in program: ' + f); continue; }
  const edits: { pos: number; end?: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    const isArr = ts.isArrayLiteralExpression(n) && n.elements.length === 0;
    const isObj = ts.isObjectLiteralExpression(n) && n.properties.length === 0;
    if (isArr || isObj) {
      const t = checker.typeToString(checker.getTypeAtLocation(n));
      const want = isArr ? t === 'never[]' : t === '{}';
      if (want && !checker.getContextualType(n as ts.Expression)) {
        const p = n.parent;
        const ann = isArr ? ARR : OBJ;
        if ((ts.isParameter(p) || ts.isVariableDeclaration(p)) && p.initializer === n && !p.type && ts.isIdentifier(p.name)) {
          edits.push({ pos: p.name.end, text: `: ${ann}` });
        } else {
          // parenthesize to stay valid in any expression position
          edits.push({ pos: n.getStart(sf), end: n.end, text: `(${isArr ? '[]' : '{}'} as ${ann})` });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let src = fs.readFileSync(abs, 'utf8');
  for (const e of edits.sort((a, b) => b.pos - a.pos)) src = src.slice(0, e.pos) + e.text + src.slice(e.end ?? e.pos);
  fs.writeFileSync(abs, src);
  console.log(`${f}: ${edits.length} literal(s)`);
}
