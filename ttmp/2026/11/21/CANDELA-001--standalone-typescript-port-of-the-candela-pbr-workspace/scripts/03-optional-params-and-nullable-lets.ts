// 03-optional-params-and-nullable-lets.ts — codemod for two JS idioms TypeScript rejects:
//
// 1. Calls with fewer arguments than parameters (TS2554 "Expected N arguments, but got M"). In JS a missing
//    argument is `undefined`; the callee handles it. For each such call, resolve the callee's declaration (only in
//    the given files) and mark its untyped, non-defaulted identifier parameters from index M on as optional (`x?`).
//    Precise: only parameters some call actually omits become optional.
// 2. `let x = null` (or a bare `let x`) with no annotation: TS types it `null`, so later assignments and narrowing
//    produce `never`. Annotate as `any`.
// 3. React `useRef(null)` / `useState(null)` → `useRef<any>(null)` / `useState<any>(null)`.
//
// Usage: npx tsx 03-optional-params-and-nullable-lets.ts <tsconfig.json> <file.ts> [...]
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const [tsconfigPath, ...files] = process.argv.slice(2);
const cfg = ts.getParsedCommandLineOfConfigFile(path.resolve(tsconfigPath), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(String(d.messageText)); } })!;
const program = ts.createProgram(cfg.fileNames, cfg.options);
const checker = program.getTypeChecker();
const targets = new Set(files.map(f => path.resolve(f)));
const edits = new Map<string, Map<number, { end?: number; text: string }>>();
const add = (file: string, pos: number, text: string, end?: number) => {
  if (!edits.has(file)) edits.set(file, new Map());
  edits.get(file)!.set(pos, { text, end });
};

const findNode = (sf: ts.SourceFile, pos: number): ts.Node | undefined => {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (n.getStart(sf) <= pos && pos < n.end) { found = n; ts.forEachChild(n, visit); } };
  visit(sf);
  return found;
};

// 1. arity
for (const d of program.getSemanticDiagnostics()) {
  if (d.code !== 2554 || !d.file || !targets.has(path.resolve(d.file.fileName))) continue;
  const m = ts.flattenDiagnosticMessageText(d.messageText, '\n').match(/but got (\d+)/);
  if (!m) continue;
  const got = +m[1];
  let n = findNode(d.file, d.start!);
  while (n && !ts.isCallExpression(n) && !ts.isNewExpression(n)) n = n.parent;
  if (!n) continue;
  const sig = checker.getResolvedSignature(n as ts.CallLikeExpression);
  const decl = sig?.declaration;
  if (!decl || ts.isJSDocSignature(decl)) continue;
  const declFile = decl.getSourceFile().fileName;
  if (!targets.has(path.resolve(declFile))) continue;
  decl.parameters.forEach((p, i) => {
    if (i >= got && !p.initializer && !p.questionToken && !p.dotDotDotToken && !p.type && ts.isIdentifier(p.name)) add(path.resolve(declFile), p.name.end, '?');
  });
}

// 2 + 3
for (const f of targets) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && !n.type && ts.isIdentifier(n.name) && ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Let)) {
      if (!n.initializer || n.initializer.kind === ts.SyntaxKind.NullKeyword) add(f, n.name.end, ': any');
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(useRef|useState)$/.test(n.expression.text) && !n.typeArguments && n.arguments.length === 1 && n.arguments[0].kind === ts.SyntaxKind.NullKeyword) {
      add(f, n.expression.end, '<any>');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

for (const [f, es] of edits) {
  let src = fs.readFileSync(f, 'utf8');
  for (const [pos, e] of [...es].sort((a, b) => b[0] - a[0])) src = src.slice(0, pos) + e.text + src.slice(e.end ?? pos);
  fs.writeFileSync(f, src);
  console.log(`${path.relative(process.cwd(), f)}: ${es.size} edit(s)`);
}
