// 01-declare-class-fields.ts — codemod: declare the fields that JS classes create by assigning `this.x = …`.
//
// For every class in the given files, collect `this.<name> = <rhs>` assignments (anywhere in the class body,
// including arrow functions inside methods) whose <name> is not already a declared member, and insert
// `<name>: <type>;` at the top of the class body. The type comes from the checker's widened type of each RHS:
// one simple type (number, string, boolean, a class instance, Set<…>, Map<…>) is used as is, with `| null` added
// when some assignment is `null`; anything else (null-only, `{}`, `never[]`, object literals, conflicts) is `any`.
//
// Usage: npx tsx 01-declare-class-fields.ts <tsconfig.json> <file.ts> [...]
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const [tsconfigPath, ...files] = process.argv.slice(2);
const cfg = ts.getParsedCommandLineOfConfigFile(path.resolve(tsconfigPath), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(String(d.messageText)); } })!;
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();

const SIMPLE = /^(number|string|boolean|bigint|[A-Z][\w]*(<[\w, <>|]+>)?|[A-Z]\w*\[\]|number\[\]|string\[\])$/;

function typeFor(rhs: ts.Expression): string | 'null' | null {
  if (rhs.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (ts.isIdentifier(rhs) && rhs.text === 'undefined') return 'null';
  const t = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(rhs));
  const s = checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
  if (/never|any|\{\}|^null$|undefined/.test(s) || s.length > 50) return null;
  return SIMPLE.test(s) ? s : null;
}

for (const f of files) {
  const abs = path.resolve(f);
  const sf = program.getSourceFile(abs);
  if (!sf) { console.error('not in program: ' + f); continue; }
  const inserts: { pos: number; text: string }[] = [];
  const visitClass = (cls: ts.ClassDeclaration | ts.ClassExpression) => {
    const declared = new Set<string>();
    for (const m of cls.members) if (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) declared.add(m.name.text);
    const found = new Map<string, (string | 'null' | null)[]>();
    const walk = (n: ts.Node) => {
      // nested classes have their own `this`
      if (n !== cls && (ts.isClassDeclaration(n) || ts.isClassExpression(n))) return;
      // a non-arrow function rebinds `this`
      if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && !ts.isMethodDeclaration(n.parent)) return;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const name = n.left.name.text;
        if (!declared.has(name)) { if (!found.has(name)) found.set(name, []); found.get(name)!.push(typeFor(n.right)); }
      }
      ts.forEachChild(n, walk);
    };
    for (const m of cls.members) walk(m);
    if (!found.size) return;
    const lines: string[] = [];
    for (const [name, ts_] of found) {
      const nonNull = [...new Set(ts_.filter(t => t !== 'null'))];
      let t: string;
      if (nonNull.length === 1 && nonNull[0] !== null) t = nonNull[0] + (ts_.includes('null') ? ' | null' : '');
      else t = 'any';
      lines.push(`  ${name}: ${t};`);
    }
    inserts.push({ pos: cls.members.pos, text: '\n' + lines.join('\n') });
  };
  const visit = (n: ts.Node) => { if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) visitClass(n); ts.forEachChild(n, visit); };
  visit(sf);
  if (!inserts.length) continue;
  let src = fs.readFileSync(abs, 'utf8');
  for (const ins of inserts.sort((a, b) => b.pos - a.pos)) src = src.slice(0, ins.pos) + ins.text + src.slice(ins.pos);
  fs.writeFileSync(abs, src);
  console.log(`${f}: ${inserts.length} class(es)`);
}
