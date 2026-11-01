'use strict';
const vscode = require('vscode');
const { analyze, scanLine } = require('./lib/analyzer');
const { DOCS, KIND_LABEL } = require('./lib/docs');

const LANGUAGE_ID = 'sqr';
const WORD_RE = /[$#&]?[A-Za-z_][\w\-]*/;

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint
};

/** uri string -> { version, result } */
const cache = new Map();
/** uri string -> debounce timer */
const timers = new Map();

// ---------------------------------------------------------------------------
// Analysis (cached per document version)
// ---------------------------------------------------------------------------
function getOptions(document) {
  const cfg = vscode.workspace.getConfiguration('sqr.lint', document.uri);
  return {
    isInclude: /\.sqc$/i.test(document.fileName),
    knownProcedures: cfg.get('knownProcedures', []),
    severity: {
      undefinedProcedure: cfg.get('undefinedProcedure', 'warning'),
      unusedProcedure: cfg.get('unusedProcedure', 'hint'),
      argumentCount: cfg.get('argumentCount', 'warning'),
      missingMainSection: cfg.get('missingMainSection', 'warning'),
      todoComments: cfg.get('todoComments', 'information')
    }
  };
}

function getAnalysis(document) {
  const key = document.uri.toString();
  const hit = cache.get(key);
  if (hit && hit.version === document.version) return hit.result;
  const result = analyze(document.getText(), getOptions(document));
  cache.set(key, { version: document.version, result });
  return result;
}

// ---------------------------------------------------------------------------
// Linting
// ---------------------------------------------------------------------------
function lint(document, collection) {
  if (document.languageId !== LANGUAGE_ID) return;
  const enabled = vscode.workspace.getConfiguration('sqr.lint', document.uri).get('enable', true);
  if (!enabled) {
    collection.delete(document.uri);
    return;
  }
  const { diagnostics } = getAnalysis(document);
  collection.set(document.uri, diagnostics.map((x) => {
    const d = new vscode.Diagnostic(
      new vscode.Range(x.line, x.start, x.line, x.end),
      x.message,
      SEVERITY[x.severity]
    );
    d.source = 'sqr';
    d.code = x.code;
    if (x.unnecessary) d.tags = [vscode.DiagnosticTag.Unnecessary];
    if (x.related) {
      d.relatedInformation = [new vscode.DiagnosticRelatedInformation(
        new vscode.Location(document.uri, new vscode.Range(x.related.line, x.related.start, x.related.line, x.related.end)),
        x.related.message
      )];
    }
    return d;
  }));
}

function scheduleLint(document, collection) {
  if (document.languageId !== LANGUAGE_ID) return;
  const key = document.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    lint(document, collection);
  }, 250));
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------
function procedureSignature(p) {
  const params = p.params && p.params.length ? ` (${p.params.join(', ')})` : '';
  return `begin-procedure ${p.name}${p.local ? ' local' : ''}${params}`;
}

function entrySyntax(entry) {
  // Variable entries store their type ("string" / "numeric") in `syntax`.
  return /^(string|numeric)$/.test(entry.syntax) ? `${entry.name}  ! ${entry.syntax} variable` : entry.syntax;
}

function docsMarkdown(entry) {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(entrySyntax(entry), 'sqr');
  md.appendText(entry.description);
  md.appendMarkdown(`\n\n*${entry.kindLabel || KIND_LABEL[entry.kind] || 'SQR'}*`);
  return md;
}

function provideHover(document, position) {
  const range = document.getWordRangeAtPosition(position, WORD_RE);
  if (!range) return undefined;

  // Ignore words inside comments or string literals.
  const scan = scanLine(document.lineAt(position.line).text);
  const word = document.getText(range);
  if (scan.code.substr(range.start.character, word.length) !== word) return undefined;

  const key = word.toLowerCase();
  const analysis = getAnalysis(document);

  const proc = /^[$#&]/.test(word) ? undefined : analysis.procedures.get(key);
  if (proc) {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(procedureSignature(proc), 'sqr');
    if (proc.doc) md.appendText(proc.doc + '\n\n');
    md.appendMarkdown(`*Procedure defined on line ${proc.line + 1}*`);
    return new vscode.Hover(md, range);
  }

  const entry = DOCS[key];
  if (entry) return new vscode.Hover(docsMarkdown(entry), range);
  return undefined;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------
const COMPLETION_KIND = {
  command: vscode.CompletionItemKind.Keyword,
  directive: vscode.CompletionItemKind.Keyword,
  function: vscode.CompletionItemKind.Function,
  variable: vscode.CompletionItemKind.Variable,
  peoplesoft: vscode.CompletionItemKind.Reference
};

function provideCompletions(document, position) {
  const scan = scanLine(document.lineAt(position.line).text);
  if (scan.commentCol >= 0 && position.character > scan.commentCol) return [];

  const items = [];
  for (const entry of Object.values(DOCS)) {
    const item = new vscode.CompletionItem(entry.name, COMPLETION_KIND[entry.kind]);
    item.detail = entrySyntax(entry).split('\n')[0];
    item.documentation = docsMarkdown(entry);
    items.push(item);
  }

  const analysis = getAnalysis(document);
  for (const p of analysis.procedures.values()) {
    const item = new vscode.CompletionItem(p.name, vscode.CompletionItemKind.Method);
    item.detail = procedureSignature(p);
    if (p.doc) item.documentation = new vscode.MarkdownString().appendText(p.doc);
    items.push(item);
  }
  for (const name of analysis.variables.values()) {
    if (DOCS[name.toLowerCase()]) continue; // already offered as a documented variable
    items.push(new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable));
  }
  return items;
}

// ---------------------------------------------------------------------------
// Symbols / definition / folding
// ---------------------------------------------------------------------------
function provideSymbols(document) {
  const { sections } = getAnalysis(document);
  return sections.map((s) => {
    const endLine = Math.min(s.endLine, document.lineCount - 1);
    const range = new vscode.Range(s.line, 0, endLine, document.lineAt(endLine).text.length);
    const nameLen = s.name.length;
    const selection = new vscode.Range(s.line, s.nameCol, s.line, s.nameCol + nameLen);
    const kind = s.type === 'begin-procedure' ? vscode.SymbolKind.Function : vscode.SymbolKind.Namespace;
    const detail = s.type === 'begin-procedure' ? (s.params && s.params.length ? `(${s.params.join(', ')})` : '') : '';
    return new vscode.DocumentSymbol(s.name, detail, kind, range, selection);
  });
}

function provideDefinition(document, position) {
  const range = document.getWordRangeAtPosition(position, WORD_RE);
  if (!range) return undefined;
  const word = document.getText(range);
  if (/^[$#&]/.test(word)) return undefined;
  const proc = getAnalysis(document).procedures.get(word.toLowerCase());
  if (!proc) return undefined;
  return new vscode.Location(document.uri, new vscode.Range(proc.line, proc.nameCol, proc.line, proc.nameCol + proc.name.length));
}

function provideFolding(document) {
  return getAnalysis(document).folds.map((f) => new vscode.FoldingRange(f.start, f.end));
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection('sqr');
  const selector = { language: LANGUAGE_ID };

  context.subscriptions.push(
    collection,
    vscode.languages.registerHoverProvider(selector, { provideHover }),
    vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems: provideCompletions }),
    vscode.languages.registerDocumentSymbolProvider(selector, { provideDocumentSymbols: provideSymbols }),
    vscode.languages.registerDefinitionProvider(selector, { provideDefinition }),
    vscode.languages.registerFoldingRangeProvider(selector, { provideFoldingRanges: provideFolding }),

    vscode.workspace.onDidOpenTextDocument((d) => lint(d, collection)),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleLint(e.document, collection)),
    vscode.workspace.onDidSaveTextDocument((d) => lint(d, collection)),
    vscode.workspace.onDidCloseTextDocument((d) => {
      const key = d.uri.toString();
      clearTimeout(timers.get(key));
      timers.delete(key);
      cache.delete(key);
      collection.delete(d.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('sqr')) return;
      cache.clear();
      vscode.workspace.textDocuments.forEach((d) => lint(d, collection));
    }),
    vscode.commands.registerCommand('sqr.lintCurrentFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        cache.delete(editor.document.uri.toString());
        lint(editor.document, collection);
      }
    })
  );

  vscode.workspace.textDocuments.forEach((d) => lint(d, collection));
}

function deactivate() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  cache.clear();
}

module.exports = { activate, deactivate };
