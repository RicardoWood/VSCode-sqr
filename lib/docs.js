'use strict';
/**
 * Condensed reference data used for hover and completion.
 * These are short summaries, not a replacement for the official
 * "SQR Language Reference" for your SQR / PeopleTools version.
 */

const DOCS = {};

function add(kind, key, syntax, description, extra) {
  DOCS[key.toLowerCase()] = Object.assign({ kind, name: key, syntax, description }, extra);
}
const C = (k, s, d, x) => add('command', k, s, d, x);
const F = (k, s, d, x) => add('function', k, s, d, x);
const V = (k, s, d, x) => add('variable', k, s, d, x);
const D = (k, s, d, x) => add('directive', k, s, d, x);
const P = (k, s, d, x) => add('peoplesoft', k, s, d, x);

// ---------------------------------------------------------------------------
// Program structure
// ---------------------------------------------------------------------------
C('begin-program', 'begin-program\n  ...\nend-program',
  'Main entry point of the report. Execution starts here after setup. Use either begin-program or its legacy synonym begin-report (one per program).');
C('begin-report', 'begin-report\n  ...\nend-report',
  'Legacy synonym for begin-program. Still used throughout PeopleSoft-delivered SQRs.');
C('begin-setup', 'begin-setup\n  ...\nend-setup',
  'Holds environment settings (page-size, declare-layout, declare-printer, ...) that are processed before the program runs. Must appear before begin-program / begin-report.');
C('begin-heading', 'begin-heading lines\n  ...\nend-heading',
  'Defines the page heading printed at the top of every page. `lines` is the number of lines reserved for the heading.');
C('begin-footing', 'begin-footing lines\n  ...\nend-footing',
  'Defines the page footing printed at the bottom of every page. `lines` is the number of lines reserved.');
C('begin-procedure', 'begin-procedure name [local] [(arg1, arg2, ...)]\n  ...\nend-procedure',
  'Defines a procedure that is invoked with `do`. Declare it `local` to keep the variables it creates local to the procedure; otherwise variables are global.');
C('begin-select', 'begin-select [-Cn] [-Bn] [-NOLOOP]\n  column  &name\nfrom table\nwhere ...\nend-select',
  'Runs a SELECT. Every selected column is followed by an `&name` column variable. The SQR statements placed after the SQL are executed once for each row returned.');
C('begin-sql', 'begin-sql [on-error={skip|warn|procedure}]\n  SQL statement\nend-sql',
  'Executes a non-SELECT SQL statement (INSERT, UPDATE, DELETE, DDL). SQR variables ($var, #var) can be referenced in the SQL.');
C('begin-document', 'begin-document (row,col)\n  free text and .keywords\nend-document',
  'Defines a free-form document paragraph that can embed variables and is printed at the given position.');
C('declare-layout', 'declare-layout name\n  [orientation=portrait|landscape] [max-lines=n] [max-columns=n] ...\nend-declare',
  'Defines a named page layout (size, orientation, margins) in begin-setup.');
C('declare-printer', 'declare-printer name\n  [type=...] [font=n] [point-size=n] ...\nend-declare',
  'Defines default printer settings such as type, font and point size.');
C('declare-report', 'declare-report name\n  [layout=name] [printer-type=type]\nend-declare',
  'Associates a layout and printer with a named report.');
C('declare-procedure', 'declare-procedure\n  [for-reports=(...)] [before-report=proc] [after-report=proc] [before-page=proc] [after-page=proc]\nend-declare',
  'Registers procedures to run at report/page boundaries.');
C('declare-variable', 'declare-variable\n  [default-numeric={decimal|float|integer}] [date ...]\nend-declare',
  'Declares program-wide defaults for variable types.');
C('declare-chart', 'declare-chart name\n  ...\nend-declare', 'Defines a chart that can be output with print-chart.');
C('declare-image', 'declare-image name\n  type=... source=...\nend-declare', 'Defines an image that can be output with print-image.');
C('declare-toc', 'declare-toc name\n  ...\nend-declare', 'Defines a table of contents.');
C('end-declare', 'end-declare', 'Closes any declare-xxx command.');

for (const sec of ['program', 'report', 'setup', 'heading', 'footing', 'procedure', 'select', 'sql', 'document']) {
  C(`end-${sec}`, `end-${sec}`, `Closes the matching begin-${sec} section.`);
}

// ---------------------------------------------------------------------------
// Flow control
// ---------------------------------------------------------------------------
C('if', 'if condition\n  ...\n[else\n  ...]\nend-if',
  'Conditional execution. Comparison operators are =, <>, <, >, <=, >=; combine conditions with and / or / not.');
C('else', 'else', 'Alternative branch of an `if`.');
C('end-if', 'end-if', 'Closes an `if` block.');
C('while', 'while condition\n  ...\nend-while', 'Repeats the block while the condition is true. Use `break` to leave the loop early.');
C('end-while', 'end-while', 'Closes a `while` block.');
C('evaluate', 'evaluate expression\n  when relop value\n    ...\n    break\n  when-other\n    ...\nend-evaluate',
  'Multi-way branch (case/switch). Use `break` to end a `when` clause; without it execution continues into the following clause.');
C('when', 'when relational-operator value', 'A branch of an `evaluate`. Several `when` lines can be stacked to share one body.');
C('when-other', 'when-other', 'Default branch of an `evaluate` (like `default:` in a switch).');
C('end-evaluate', 'end-evaluate', 'Closes an `evaluate` block.');
C('break', 'break', 'Leaves the current `while` loop or `evaluate` clause.');
C('stop', 'stop [quiet]', 'Terminates the program immediately. `quiet` suppresses the stop message.');
C('exit-select', 'exit-select', 'Leaves the current begin-select loop; processing continues after end-select.');
C('do', 'do procedure [(arg1, arg2, ...)]', 'Calls a procedure. The number of arguments must match the procedure\'s parameter list.');
C('call', 'call subroutine using arg1, arg2, ...', 'Calls an external user-defined subroutine (C/COBOL-style user function).');

// ---------------------------------------------------------------------------
// Assignment, arithmetic, strings
// ---------------------------------------------------------------------------
C('let', 'let target = expression', 'Assigns the result of an expression to a variable, column or array field. Expressions support arithmetic, `||` concatenation and built-in functions.');
C('move', 'move source to destination [format-mask]', 'Copies a value to a variable, converting its type. The optional mask controls number/date conversion.');
C('add', 'add source to destination', 'Adds a number to a numeric variable.');
C('subtract', 'subtract source from destination', 'Subtracts a number from a numeric variable.');
C('multiply', 'multiply source times destination', 'Multiplies a numeric variable by a number.');
C('divide', 'divide source into destination', 'Divides a numeric variable by a number.');
C('concat', 'concat source with destination', 'Appends the source to the end of a string variable.');
C('string', 'string source1 source2 ... by separator into destination', 'Joins values, placing the separator between them.');
C('unstring', 'unstring source by delimiter into var1 var2 ...', 'Splits a string at each delimiter into several string variables.');
C('extract', 'extract destination from source start length', 'Copies `length` characters beginning at `start` into the destination.');
C('find', 'find search-string in source start #position', 'Locates a string within another. `#position` is set to -1 when not found.');
C('encode', "encode 'text' into $variable", 'Converts an encoded string (such as non-printable characters written as <27>) into its real characters.');
C('uppercase', 'uppercase $variable', 'Converts a string variable to upper case in place.');
C('lowercase', 'lowercase $variable', 'Converts a string variable to lower case in place.');
C('lookup', 'lookup name key-value $result', 'Looks up a key in a table loaded with load-lookup and returns the associated value.');
C('load-lookup', "load-lookup name=array table=table key=key_column return_value=value_column [rows=n] [where='...']",
  'Loads rows of a database table into memory so they can be searched quickly with `lookup`.');

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------
C('create-array', 'create-array name=array size=n\n  field=name:type[:occurs][=initial] ...', 'Creates an in-memory array. Field types are char, number and date.');
C('get', 'get var1 var2 ... from array(index) field1 field2 ...', 'Reads array fields into variables.');
C('put', 'put source1 source2 ... into array(index) field1 field2 ...', 'Stores values into array fields.');
C('array-add', 'array-add source1 ... to array(index) field1 ...', 'Adds values to numeric array fields.');
C('array-subtract', 'array-subtract source1 ... from array(index) field1 ...', 'Subtracts values from numeric array fields.');
C('array-multiply', 'array-multiply source1 ... times array(index) field1 ...', 'Multiplies numeric array fields.');
C('array-divide', 'array-divide source1 ... into array(index) field1 ...', 'Divides numeric array fields.');
C('clear-array', 'clear-array name=array [field=name[(occurrence)]]', 'Resets an array (or specific fields) to initial values.');

// ---------------------------------------------------------------------------
// Output and layout
// ---------------------------------------------------------------------------
C('print', "print expression (row,col[,length]) [bold] [underline] [reverse] [center] [fill] [edit mask] [wrap length lines]",
  'Prints a value on the report. Position is (row,col): use +n / -n for relative rows and columns. `edit` applies a format mask, `wrap` flows long text over several lines.');
C('print-direct', 'print-direct [printer=type] expression [noline]', 'Sends text or control codes straight to the output without SQR formatting.');
C('display', 'display expression [noline]', 'Writes to the terminal / process log (not the report). `noline` suppresses the newline.');
C('show', 'show expression1 expression2 ...', 'Like `display`, but accepts several items separated by spaces. Commonly used for debug and log output.');
C('input', "input $variable ['prompt'] [type=char|date|integer|number] [maxlen=n] [batch-mode]", 'Prompts the user for a value (or reads it from the command line in batch mode).');
C('new-page', 'new-page', 'Ends the current page (printing the footing) and starts a new one.');
C('new-report', "new-report 'filename'", 'Closes the current report output file and starts a new one.');
C('use-report', 'use-report report-name', 'Switches output to a report defined with declare-report.');
C('next-listing', 'next-listing [need=lines] [no-advance] [skiplines=n]', 'Advances to the next output line, optionally ensuring enough room remains on the page.');
C('position', 'position (row,col)', 'Sets the current print position without printing.');
C('columns', 'columns col1 col2 ... [at-end=newline|...]', 'Defines columns for multi-column printing.');
C('next-column', 'next-column [at-end=newline|...]', 'Moves to the next defined column.');
C('use-column', 'use-column column-number', 'Switches the active column.');
C('graphic', 'graphic (row,col,length) {box|horz-line|vert-line|font} [width]', 'Draws boxes, lines or sets a font on the report.');
C('print-bar-code', 'print-bar-code (row,col) type=... text=...', 'Prints a bar code.');
C('print-image', 'print-image name (row,col) [image-size=(w,h)]', 'Prints an image declared with declare-image.');
C('print-chart', 'print-chart name (row,col) ...', 'Prints a chart declared with declare-chart.');
C('alter-printer', 'alter-printer [point-size=n] [font=n] [pitch=n] [symbol-set=n]', 'Changes printer font attributes from this point on.');
C('alter-report', 'alter-report [heading=...] [footing=...]', 'Changes report attributes such as the heading and footing procedures.');
C('page-size', 'page-size rows columns', 'Sets the page size, usually in begin-setup.');
C('page-number', 'print page-number (row,col)', 'Reserved print item that yields the current page number.');
C('last-page', 'print last-page (row,col)', 'Reserved print item that yields the total number of pages.');
C('sql-count', 'print sql-count (row,col)', 'Reserved print item that yields the number of rows processed by the last SQL.');

// ---------------------------------------------------------------------------
// Files and database
// ---------------------------------------------------------------------------
C('open', "open 'filename' as filenum\n  {for-reading|for-writing|for-append}\n  record=length[:fixed|:vary] [status=#var]",
  'Opens an external file. Check the status variable (non-zero means failure).');
C('close', 'close filenum', 'Closes a file opened with `open`.');
C('read', 'read filenum into $var:length [$var2:length ...] [status=#var]', 'Reads a record from a file. `#end-file` is set to 1 at end of file.');
C('write', 'write filenum from expression:length [expression:length ...]', 'Writes a record to a file.');
C('commit', 'commit', 'Commits the current database transaction.');
C('rollback', 'rollback', 'Rolls back the current database transaction.');
C('execute', 'execute [-Cn] [on-error=procedure] [@#status =] stored_procedure args', 'Executes a stored procedure (Sybase/SQL Server style).');
C('ask', "ask substitution-variable 'prompt'", 'Prompts at start-up for the value of a substitution variable used as {variable}.');

// ---------------------------------------------------------------------------
// Compiler directives
// ---------------------------------------------------------------------------
D('#include', "#include 'filename'", "Inserts another source file at compile time. PeopleSoft's delivered libraries use the .sqc extension (setenv.sqc, stdapi.sqc, ...).");
D('#define', '#define name value', 'Defines a substitution variable, used in code as {name}.');
D('#undef', '#undef name', 'Removes a substitution variable defined with #define.');
D('#ifdef', '#ifdef name\n  ...\n#end-if', 'Compiles the following code only if the substitution variable is defined.');
D('#ifndef', '#ifndef name\n  ...\n#end-if', 'Compiles the following code only if the substitution variable is NOT defined.');
D('#if', "#if {name} = 'value'\n  ...\n#end-if", 'Compile-time conditional on the value of a substitution variable.');
D('#else', '#else', 'Alternative branch of a compile-time conditional.');
D('#endif', '#endif', 'Closes a compile-time conditional.');
D('#end-if', '#end-if', 'Closes a compile-time conditional.');
D('#debug', '#debug [letters] statement', 'Statement is compiled only when the program is run with the matching -DEBUG option.');

// ---------------------------------------------------------------------------
// Built-in functions
// ---------------------------------------------------------------------------
F('abs', 'abs(number)', 'Absolute value.');
F('acos', 'acos(number)', 'Arc cosine (radians).');
F('asin', 'asin(number)', 'Arc sine (radians).');
F('atan', 'atan(number)', 'Arc tangent (radians).');
F('ceil', 'ceil(number)', 'Smallest integer greater than or equal to the number.');
F('cos', 'cos(radians)', 'Cosine.');
F('cosh', 'cosh(number)', 'Hyperbolic cosine.');
F('deg', 'deg(radians)', 'Converts radians to degrees.');
F('exp', 'exp(number)', 'e raised to the given power.');
F('floor', 'floor(number)', 'Largest integer less than or equal to the number.');
F('log', 'log(number)', 'Natural logarithm.');
F('log10', 'log10(number)', 'Base-10 logarithm.');
F('mod', 'mod(dividend, divisor)', 'Remainder of a division.');
F('power', 'power(base, exponent)', 'Raises base to the exponent.');
F('rad', 'rad(degrees)', 'Converts degrees to radians.');
F('round', 'round(number, places)', 'Rounds a number to the given number of decimal places.');
F('sign', 'sign(number)', 'Returns -1, 0 or 1 according to the sign of the number.');
F('sin', 'sin(radians)', 'Sine.');
F('sinh', 'sinh(number)', 'Hyperbolic sine.');
F('sqrt', 'sqrt(number)', 'Square root.');
F('tan', 'tan(radians)', 'Tangent.');
F('tanh', 'tanh(number)', 'Hyperbolic tangent.');
F('trunc', 'trunc(number, places)', 'Truncates (does not round) a number to the given decimal places.');
F('ascii', 'ascii(string)', 'Numeric character code of the first character.');
F('chr', 'chr(number)', 'Character for a numeric code.');
F('cond', 'cond(cond1, value1 [, cond2, value2 ...], default)', 'Returns the value paired with the first true condition, otherwise the default. Inline if/else for expressions.');
F('edit', "edit(value, 'mask')", 'Formats a number, date or string using an edit mask.');
F('instr', 'instr(string, search, start)', 'Position (1-based) of `search` within `string`, or 0 if not found.');
F('isblank', 'isblank(string)', 'Returns 1 if the string is empty or only spaces, otherwise 0.');
F('isnull', 'isnull(value)', 'Returns 1 if the value (such as a database column) is NULL, otherwise 0.');
F('length', 'length(string)', 'Number of characters in the string.');
F('lengthp', 'lengthp(string)', 'Printed length of a string (accounts for multi-byte characters).');
F('lower', 'lower(string)', 'Converts to lower case.');
F('lpad', 'lpad(string, length, pad)', 'Pads the left side of a string to the given length.');
F('ltrim', 'ltrim(string, set)', 'Removes leading characters found in `set`.');
F('nvl', 'nvl(value, replacement)', 'Returns `replacement` if `value` is NULL.');
F('rpad', 'rpad(string, length, pad)', 'Pads the right side of a string to the given length.');
F('rtrim', 'rtrim(string, set)', 'Removes trailing characters found in `set`.');
F('soundex', 'soundex(string)', 'Phonetic (Soundex) code of a string.');
F('substr', 'substr(string, start, length)', 'Substring beginning at `start` (1-based).');
F('substrb', 'substrb(string, start, length)', 'Byte-based substring.');
F('substrp', 'substrp(string, start, length)', 'Substring based on printed positions.');
F('to_char', 'to_char(number)', 'Converts a number to a string.');
F('to_number', 'to_number(string)', 'Converts a string to a number.');
F('to_multi_byte', 'to_multi_byte(string)', 'Converts single-byte characters to multi-byte equivalents.');
F('to_single_byte', 'to_single_byte(string)', 'Converts multi-byte characters to single-byte equivalents.');
F('translate', 'translate(string, from-set, to-set)', 'Replaces each character in `from-set` with the matching character in `to-set`.');
F('upper', 'upper(string)', 'Converts to upper case.');
F('datenow', 'datenow()', 'Current date and time as a date variable.');
F('strtodate', "strtodate(string [, 'format'])", 'Converts a string to a date variable.');
F('datetostr', "datetostr(date [, 'format'])", 'Converts a date variable to a string.');
F('dateadd', "dateadd(date, 'unit', amount)", 'Adds an amount of the given unit (year, quarter, month, week, day, hour, minute, second) to a date.');
F('datediff', "datediff(date1, date2, 'unit')", 'Difference between two dates in the given unit.');

// ---------------------------------------------------------------------------
// Reserved variables
// ---------------------------------------------------------------------------
V('#current-column', 'numeric', 'Current column position on the report page.');
V('#current-line', 'numeric', 'Current line number on the report page.');
V('#end-file', 'numeric', 'Set to 1 when `read` reaches end of file, otherwise 0.');
V('#page-count', 'numeric', 'Current page number.');
V('#return-status', 'numeric', 'Status returned by the last stored procedure.');
V('#sql-count', 'numeric', 'Number of rows processed by the last SQL statement.');
V('#sql-status', 'numeric', 'Database status code of the last SQL statement (0 = success).');
V('#sqr-max-columns', 'numeric', 'Maximum number of columns on the page.');
V('#sqr-max-lines', 'numeric', 'Maximum number of lines on the page.');
V('#sqr-pid', 'numeric', 'Operating-system process ID of the running SQR.');
V('$sql-error', 'string', 'Error message text from the last SQL statement.');
V('$sqr-database', 'string', 'Name of the database type SQR is connected to (e.g. ORACLE).');
V('$sqr-encoding', 'string', 'Character-set encoding in use.');
V('$sqr-hostname', 'string', 'Host name of the machine running SQR.');
V('$sqr-locale', 'string', 'Current locale.');
V('$sqr-platform', 'string', 'Operating-system platform SQR is running on.');
V('$sqr-program', 'string', 'Name of the running SQR program.');
V('$sqr-report', 'string', 'Name of the current report output file.');
V('$sqr-ver', 'string', 'SQR version.');
V('$username', 'string', 'Database user name SQR connected with.');
V('$current-date', 'string', 'Current date and time at program start.');

// ---------------------------------------------------------------------------
// PeopleSoft conventions (from the delivered .sqc libraries)
// ---------------------------------------------------------------------------
P('Init-DateTime', 'do Init-DateTime', 'PeopleSoft standard procedure (datetime.sqc): initializes date/time formatting routines. Normally called first in begin-report.');
P('Init-Number', 'do Init-Number', 'PeopleSoft standard procedure (number.sqc): initializes number formatting routines.');
P('Get-Current-DateTime', 'do Get-Current-DateTime', 'PeopleSoft standard procedure (curdttim.sqc): populates the current date/time variables such as $AsOfToday, $AsOfNow, $ReportDate and $ReportTime.');
P('Reset', 'do Reset', 'PeopleSoft standard procedure (reset.sqc): end-of-report housekeeping run before termination.');
P('Stdapi-Init', 'do Stdapi-Init', 'PeopleSoft standard procedure (stdapi.sqc): initializes Process Scheduler integration (reads the process request and updates its run status).');
P('Stdapi-Term', 'do Stdapi-Term', 'PeopleSoft standard procedure (stdapi.sqc): finalizes Process Scheduler integration and records the final run status.');
P('$prcs_process_instance', 'string', 'Process Scheduler process instance of the current run (the numeric form is #prcs_process_instance).', { kindLabel: 'PeopleSoft variable' });
P('#prcs_process_instance', 'numeric', 'Process Scheduler process instance of the current run.', { kindLabel: 'PeopleSoft variable' });
P('$prcs_oprid', 'string', 'Operator ID of the user who submitted the process.', { kindLabel: 'PeopleSoft variable' });
P('$prcs_run_cntl_id', 'string', 'Run control ID used for this process request. Typically joined with $prcs_oprid to read run-control parameters.', { kindLabel: 'PeopleSoft variable' });
P('$AsOfToday', 'string', "Today's date in database format, set by Get-Current-DateTime.", { kindLabel: 'PeopleSoft variable' });
P('$AsOfNow', 'string', 'Current date/time in database format, set by Get-Current-DateTime.', { kindLabel: 'PeopleSoft variable' });
P('$ReportDate', 'string', 'Run date formatted for report headings, set by Get-Current-DateTime.', { kindLabel: 'PeopleSoft variable' });
P('$ReportTime', 'string', 'Run time formatted for report headings, set by Get-Current-DateTime.', { kindLabel: 'PeopleSoft variable' });
P('$ReportTitle', 'string', 'By convention, the report title that your Init-Report procedure sets and your heading prints.', { kindLabel: 'PeopleSoft variable' });
P('$ReportID', 'string', 'By convention, the report ID that your Init-Report procedure sets and your heading prints.', { kindLabel: 'PeopleSoft variable' });

const KIND_LABEL = {
  command: 'SQR command',
  function: 'SQR function',
  variable: 'SQR reserved variable',
  directive: 'SQR compiler directive',
  peoplesoft: 'PeopleSoft standard'
};

module.exports = { DOCS, KIND_LABEL };
