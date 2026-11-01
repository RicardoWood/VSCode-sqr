'use strict';
/**
 * SQR analyzer: a dependency-free, line-oriented analysis pass that produces
 * lint diagnostics, procedure/section info (for hover, outline, go-to-definition)
 * and folding ranges. It deliberately has no `vscode` import so it can be unit
 * tested with plain Node.
 */

// ---------------------------------------------------------------------------
// Block structure
// ---------------------------------------------------------------------------
const CLOSER_OF = {
  'begin-procedure': 'end-procedure',
  'begin-program': 'end-program',
  'begin-report': 'end-report',
  'begin-setup': 'end-setup',
  'begin-heading': 'end-heading',
  'begin-footing': 'end-footing',
  'begin-select': 'end-select',
  'begin-sql': 'end-sql',
  'begin-document': 'end-document',
  'if': 'end-if',
  'while': 'end-while',
  'evaluate': 'end-evaluate',
  'declare': 'end-declare' // every declare-xxx command closes with end-declare
};
const TYPE_OF_CLOSER = {};
for (const [type, closer] of Object.entries(CLOSER_OF)) TYPE_OF_CLOSER[closer] = type;

// Sections that can only appear at the top level of a program.
const SECTION_LEVEL = new Set([
  'begin-procedure', 'begin-program', 'begin-report',
  'begin-setup', 'begin-heading', 'begin-footing'
]);
// Blocks whose body is free text / raw SQL and is not parsed as SQR statements.
const RAW_BLOCKS = new Set(['begin-sql', 'begin-document']);

// First-words that prove we have left the SQL portion of a begin-select and are
// now reading SQR statements (used so CASE/WHEN/ELSE inside SQL isn't mistaken
// for SQR evaluate/if).
const STATEMENT_STARTERS = new Set([
  'print', 'print-direct', 'let', 'do', 'call', 'if', 'while', 'evaluate',
  'move', 'add', 'subtract', 'multiply', 'divide', 'display', 'show',
  'write', 'read', 'open', 'close', 'put', 'get', 'new-page', 'next-listing',
  'position', 'stop', 'unstring', 'string', 'concat', 'extract', 'find',
  'lookup', 'encode', 'commit', 'rollback', 'array-add', 'array-subtract',
  'array-multiply', 'array-divide', 'clear-array', 'exit-select', 'break',
  'use-column', 'next-column', 'graphic', 'alter-printer', 'alter-report',
  'print-bar-code', 'print-image', 'print-chart', 'uppercase', 'lowercase',
  'begin-select', 'begin-sql'
]);

// Procedures supplied by PeopleSoft's delivered .sqc libraries.
const DEFAULT_KNOWN_PROCEDURES = [
  'init-datetime', 'init-number', 'get-current-datetime', 'reset',
  'stdapi-init', 'stdapi-term', 'format-datetime', 'format-number',
  'convert-to-dtu-date', 'convert-from-dtu-date', 'dtu-add-days',
  'dtu-add-months', 'dtu-add-years', 'dtu-diff-days'
];

const DEFAULT_SEVERITY = {
  undefinedProcedure: 'warning',
  unusedProcedure: 'hint',
  argumentCount: 'warning',
  missingMainSection: 'warning',
  todoComments: 'information'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scans one physical line. Returns `code` (same length as the input; string
 * contents and comments blanked out with spaces), the column of a trailing `!`
 * comment (or -1) and the column of an unterminated quote (or -1).
 */
function scanLine(line) {
  let out = '';
  let quote = false;
  let quoteStart = -1;
  let commentCol = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "'") {
        if (line[i + 1] === "'") { out += '  '; i++; continue; } // escaped quote
        quote = false;
        out += ch;
        continue;
      }
      out += ' ';
      continue;
    }
    if (ch === "'") { quote = true; quoteStart = i; out += ch; continue; }
    if (ch === '!') { commentCol = i; break; }
    out += ch;
  }
  if (out.length < line.length) out += ' '.repeat(line.length - out.length);
  return {
    code: out,
    commentCol,
    comment: commentCol >= 0 ? line.slice(commentCol + 1) : null,
    openQuoteCol: quote ? quoteStart : -1
  };
}

function countArgs(argText) {
  if (argText.trim() === '') return 0;
  let depth = 0;
  let count = 1;
  for (const ch of argText) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

function openerType(kw) {
  if (kw.startsWith('declare-')) return 'declare';
  if (kw !== 'declare' && Object.prototype.hasOwnProperty.call(CLOSER_OF, kw)) return kw;
  return null;
}

/** Collects the comment block directly above a procedure as documentation. */
function docAbove(lines, index) {
  const out = [];
  for (let j = index - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (!t.startsWith('!')) break;
    const text = t.replace(/^!+[\s*\-=_#~]*/, '').replace(/[\s*\-=_#~]+$/, '');
    if (text) out.unshift(text);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------
function analyze(text, opts) {
  const o = Object.assign({ isInclude: false, knownProcedures: [], severity: {} }, opts);
  const sev = Object.assign({}, DEFAULT_SEVERITY, o.severity);
  const known = new Set(DEFAULT_KNOWN_PROCEDURES.concat(o.knownProcedures).map((s) => String(s).toLowerCase()));

  const lines = text.split(/\r\n|\r|\n/);
  const diagnostics = [];
  const procedures = new Map(); // lower-case name -> info
  const sections = [];
  const calls = [];
  const includes = [];
  const folds = [];
  const stack = [];
  const uses = new Map();
  const variables = new Map();
  let hasMain = false;
  let hasDynamicDo = false;

  function report(line, start, end, severity, code, message, extra) {
    if (!severity || severity === 'off') return;
    diagnostics.push(Object.assign({ line, start, end, severity, code, message }, extra));
  }

  function closeFrame(frame, endLine) {
    if (frame.info) frame.info.endLine = Math.max(endLine, frame.line);
    if (endLine - frame.line > 1) folds.push({ start: frame.line, end: endLine - 1 });
  }

  function reportMissingCloser(frame, suffix) {
    report(frame.line, frame.col, frame.col + frame.word.length, 'error', 'SQR001',
      `Missing '${frame.closer}' for '${frame.word}'${suffix || ''}`);
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let top = stack[stack.length - 1];

    // Raw bodies (begin-sql / begin-document): only look for the closer.
    if (top && RAW_BLOCKS.has(top.type)) {
      const m = /^\s*(end-(?:sql|document))(?![\w-])/i.exec(raw);
      if (m && m[1].toLowerCase() === top.closer) {
        stack.pop();
        closeFrame(top, i);
      }
      continue;
    }

    const inc = /^\s*#include\s+['"]?([^'"\s!]+)/i.exec(raw);
    if (inc) includes.push({ file: inc[1], line: i });

    const scan = scanLine(raw);
    const code = scan.code;

    // TODO / FIXME comments
    if (scan.comment !== null) {
      const t = /\b(TODO|FIXME|HACK|XXX)\b/.exec(scan.comment);
      if (t) {
        const col = scan.commentCol + 1 + t.index;
        report(i, col, raw.length, sev.todoComments, 'SQR008', `${t[1]} comment`);
      }
    }

    // Unterminated string (skip if line ends with a continuation hyphen)
    if (scan.openQuoteCol >= 0 && !/-\s*$/.test(raw)) {
      report(i, scan.openQuoteCol, raw.length, 'warning', 'SQR002', 'Unterminated string literal');
    }

    // Identifier usage (for "unused procedure") and variable names (for completion)
    let m;
    const idRe = /(?<![\w\-$#&])[A-Za-z_][\w\-]*/g;
    while ((m = idRe.exec(code))) {
      const k = m[0].toLowerCase();
      if (!uses.has(k)) uses.set(k, []);
      uses.get(k).push({ line: i, col: m.index });
    }
    const varRe = /[$#&][A-Za-z_][\w\-]*(?:\.[A-Za-z_][\w\-]*)*/g;
    while ((m = varRe.exec(code))) {
      const k = m[0].toLowerCase();
      if (!variables.has(k)) variables.set(k, m[0]);
    }

    const first = /^\s*([A-Za-z][\w\-]*)/.exec(code);
    if (!first) continue;
    const kw = first[1].toLowerCase();
    const kwCol = first[0].length - first[1].length;
    const kwEnd = kwCol + kw.length;
    const opener = openerType(kw);

    top = stack[stack.length - 1];
    if (top && top.type === 'begin-select' && top.sql && (opener || STATEMENT_STARTERS.has(kw))) {
      top.sql = false; // we've reached the SQR statements after the SELECT
    }
    const inSelectSql = !!(top && top.type === 'begin-select' && top.sql);

    // ---- openers ---------------------------------------------------------
    if (opener) {
      if (SECTION_LEVEL.has(opener)) {
        // A new top-level section means everything still open was never closed.
        while (stack.length) {
          const f = stack.pop();
          reportMissingCloser(f, ` before '${kw}' on line ${i + 1}`);
          closeFrame(f, i - 1);
        }
        if (opener === 'begin-program' || opener === 'begin-report') hasMain = true;
      }

      const frame = {
        type: opener, word: kw, closer: CLOSER_OF[opener],
        line: i, col: kwCol, sql: opener === 'begin-select', info: null
      };

      if (SECTION_LEVEL.has(opener)) {
        const info = { type: opener, name: kw, line: i, col: kwCol, nameCol: kwCol, endLine: i };
        sections.push(info);
        frame.info = info;

        if (opener === 'begin-procedure') {
          const pm = /^\s*begin-procedure\s+([A-Za-z_][\w\-]*)(.*)$/i.exec(code);
          if (!pm) {
            report(i, kwCol, kwEnd, 'error', 'SQR001', "'begin-procedure' requires a procedure name");
          } else {
            const name = pm[1];
            const rest = pm[2];
            const nameCol = code.length - rest.length - name.length;
            const par = /\(([^)]*)\)/.exec(rest);
            Object.assign(info, {
              name,
              nameCol,
              params: par ? par[1].split(',').map((s) => s.trim()).filter(Boolean) : [],
              local: /\blocal\b/i.test(rest),
              doc: docAbove(lines, i)
            });
            const key = name.toLowerCase();
            if (procedures.has(key)) {
              const first1 = procedures.get(key);
              report(i, nameCol, nameCol + name.length, 'error', 'SQR003',
                `Procedure '${name}' is already defined on line ${first1.line + 1}`,
                { related: { line: first1.line, start: first1.nameCol, end: first1.nameCol + first1.name.length, message: 'First definition' } });
            } else {
              procedures.set(key, info);
            }
          }
        }
      }
      stack.push(frame);
      continue;
    }

    // ---- else / when / when-other ------------------------------------------
    if (kw === 'else' || kw === 'when' || kw === 'when-other') {
      if (inSelectSql) continue; // part of a SQL CASE expression
      const want = kw === 'else' ? 'if' : 'evaluate';
      if (!top || top.type !== want) {
        report(i, kwCol, kwEnd, 'error', 'SQR001', `'${kw}' without a matching '${want}'`);
      }
      continue;
    }

    // ---- closers -----------------------------------------------------------
    const ctype = TYPE_OF_CLOSER[kw];
    if (ctype) {
      let idx = -1;
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].type === ctype) { idx = j; break; }
      }
      if (idx < 0) {
        const wanted = ctype === 'declare' ? 'a declare-xxx command' : `'${ctype}'`;
        report(i, kwCol, kwEnd, 'error', 'SQR001', `'${kw}' has no matching ${wanted}`);
        continue;
      }
      while (stack.length - 1 > idx) {
        const f = stack.pop();
        reportMissingCloser(f, ` before '${kw}' on line ${i + 1}`);
        closeFrame(f, i - 1);
      }
      closeFrame(stack.pop(), i);
      continue;
    }

    // ---- do <procedure>(args) ---------------------------------------------
    if (kw === 'do') {
      const dm = /^\s*do\s+([A-Za-z_][\w\-]*)\s*(?:\((.*)\))?/i.exec(code);
      if (dm) {
        calls.push({
          name: dm[1],
          line: i,
          col: code.indexOf(dm[1], kwCol + 2),
          argc: dm[2] === undefined ? 0 : countArgs(dm[2])
        });
      } else if (/^\s*do\s+[[$]/i.test(code)) {
        hasDynamicDo = true;
      }
    }
  }

  // Anything still open at end of file
  while (stack.length) {
    const f = stack.pop();
    reportMissingCloser(f);
    closeFrame(f, lines.length - 1);
  }

  // ---- cross-reference checks ---------------------------------------------
  const hasIncludes = includes.length > 0;
  for (const c of calls) {
    const key = c.name.toLowerCase();
    const def = procedures.get(key);
    if (!def) {
      if (known.has(key)) continue;
      let s = sev.undefinedProcedure;
      if (hasIncludes && (s === 'warning' || s === 'error')) s = 'information';
      const msg = hasIncludes
        ? `Procedure '${c.name}' is not defined in this file (it may come from an #include)`
        : `Procedure '${c.name}' is not defined`;
      report(c.line, c.col, c.col + c.name.length, s, 'SQR004', msg);
    } else if (def.params && def.params.length !== c.argc) {
      report(c.line, c.col, c.col + c.name.length, sev.argumentCount, 'SQR005',
        `Procedure '${def.name}' takes ${def.params.length} argument(s) but is called with ${c.argc}`,
        { related: { line: def.line, start: def.nameCol, end: def.nameCol + def.name.length, message: 'Procedure definition' } });
    }
  }

  if (!o.isInclude && !hasDynamicDo) {
    for (const [key, def] of procedures) {
      if (known.has(key)) continue;
      const refs = (uses.get(key) || []).filter((u) => !(u.line === def.line && u.col === def.nameCol));
      if (refs.length === 0) {
        report(def.line, def.nameCol, def.nameCol + def.name.length, sev.unusedProcedure, 'SQR006',
          `Procedure '${def.name}' is never called`, { unnecessary: true });
      }
    }
  }

  if (!o.isInclude && !hasMain && lines.some((l) => l.trim() !== '')) {
    const firstLine = Math.max(0, lines.findIndex((l) => l.trim() !== ''));
    report(firstLine, 0, lines[firstLine].length, sev.missingMainSection, 'SQR007',
      "No 'begin-program' or 'begin-report' section found (ignore this for include files)");
  }

  return { diagnostics, procedures, sections, folds, variables, includes, lines };
}

module.exports = { analyze, scanLine, DEFAULT_KNOWN_PROCEDURES };
