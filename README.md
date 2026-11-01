# PeopleSoft SQR for VS Code

Language support for **PeopleSoft SQR** (`.sqr`, `.sqc`).

## Features

| Feature | Details |
|---|---|
| **Syntax highlighting** | Commands, section blocks, control flow, built-in functions, `$string` / `#numeric` / `&column` variables, reserved variables, `{substitution}` variables, `(row,col,len)` positions, `#include`/`#define` directives, `!` comments, and SQL keywords inside `begin-select` / `begin-sql`. |
| **Linting** | Unbalanced blocks (`begin-*`/`end-*`, `if`, `while`, `evaluate`, `declare-*`), misplaced `else`/`when`, duplicate procedures, undefined procedures, wrong argument counts on `do`, unused procedures, missing `begin-program`/`begin-report`, unterminated strings, TODO/FIXME comments. |
| **Snippets** | Procedures, sections, select/SQL, control flow, file I/O loops, arrays, lookups, directives, plus a PeopleSoft report skeleton and run-control reader. |
| **Hover docs** | ~200 commands, functions, directives, reserved and PeopleSoft variables. Hovering a procedure shows its signature and the comment block above its `begin-procedure`. |
| **Extras** | Completion, outline / breadcrumbs, go-to-definition for procedures, code folding, auto-indent. |

## Lint rules

| Code | Meaning | Default |
|---|---|---|
| SQR001 | Unbalanced / misplaced block keyword | error |
| SQR002 | Unterminated string literal | warning |
| SQR003 | Duplicate procedure definition | error |
| SQR004 | `do` of an undefined procedure | warning (information if the file has `#include`s) |
| SQR005 | Wrong number of arguments in `do` | warning |
| SQR006 | Procedure never referenced (skipped for `.sqc`) | hint |
| SQR007 | No `begin-program` / `begin-report` (skipped for `.sqc`) | warning |
| SQR008 | TODO / FIXME / HACK / XXX comment | information |

Procedures that live in include files (your own `.sqc` libraries) can be listed in
`sqr.lint.knownProcedures` so they are never reported. The delivered PeopleSoft ones
(`Init-DateTime`, `Stdapi-Init`, ...) are already known. Every rule except SQR001-003
can be set to `off` in settings (`sqr.lint.*`).

## Colours

The extension ships its own colour palette for SQR tokens, so highlighting looks
distinct in any theme (section keywords purple, control flow red, commands blue,
functions gold, `$string` green, `#numeric` orange, `&column` pink, comments green italic, ...).
To change a colour, add a rule to `editor.tokenColorCustomizations` in your settings
using the scope names from `syntaxes/sqr.tmLanguage.json` (e.g. `keyword.other.command.sqr`).
To use your theme's own colours instead, remove the `configurationDefaults` block from `package.json`.

---

Icons by [Icons8](https://icons8.com "Icons8")