# CSV Edge Cases Research Report

## Scope and Goal

This report catalogs CSV edge cases that commonly break parsing and stringifying libraries, with special focus on:

- interoperability failures between tools,
- data integrity failures (silent corruption),
- security failures (CSV/formula injection), and
- less-popular but real-world corner cases.

This is intentionally implementation-agnostic. It does not evaluate the current `smolcsv` code.

## Standards Reality Check

CSV has a "specification gradient" rather than one universally enforced standard:

- RFC 4180 describes common practice (informational, not a strict internet standard).
- `draft-shafranovich-rfc4180-bis` reflects newer practice:
  - UTF-8 default,
  - CR, LF, or CRLF line breaks may be recognized,
  - binary content may occur,
  - explicit implementation concerns (empty files, empty lines, null values, BOM, bidi, comments).
- Spreadsheet applications (Excel, LibreOffice, Google Sheets) and database loaders (PostgreSQL `COPY`) add dialect behavior that often conflicts with strict RFC expectations.

Practical implication: robust CSV libraries usually need explicit _modes_ (strict RFC-like, permissive import, spreadsheet-safe export), not one global behavior.

---

## Part I: Parsing Edge Cases

### 1) Quoted fields that span multiple physical lines

- **Failure mode:** line-by-line parsers split records too early.
- **Impact:** row shape corruption, shifted columns, downstream parse errors.
- **Example:**

```csv
id,text
1,"line one
line two"
```

- **Strict recommendation:** require balanced quotes and keep internal newlines as field data.
- **Permissive recommendation:** same behavior, but with clearer diagnostics when EOF arrives before quote closure.

### 2) Unclosed quote at EOF

- **Failure mode:** parser hangs, over-reads, or emits partial row silently.
- **Impact:** truncation and hard-to-debug ingestion bugs.
- **Example:**

```csv
a,b
1,"oops
```

- **Strict recommendation:** hard error with row/column offset.
- **Permissive recommendation:** optional recover-as-text mode, but emit explicit warning/error object.

### 3) Bare quote inside unquoted field

- **Failure mode:** ambiguous tokenizer state.
- **Impact:** inconsistent behavior across libraries.
- **Example:**

```csv
a,b
1,ab"cd
```

- **Strict recommendation:** reject.
- **Permissive recommendation:** optional `relax_quotes`-style mode for compatibility imports.

### 4) Escaped quotes handling (`""` inside quoted field)

- **Failure mode:** parser returns wrong literal content or prematurely closes field.
- **Impact:** data corruption in text-heavy cells.
- **Example:**

```csv
msg
"He said ""hello"""
```

- **Expected parsed value:** `He said "hello"`.

### 5) Ragged rows (inconsistent column counts)

- **Failure mode:** strict row-shape assumptions crash or misalign objects.
- **Impact:** missing values, dropped values, or dictionary key skew.
- **Example:**

```csv
h1,h2,h3
1,2
3,4,5,6
```

- **Strict recommendation:** reject inconsistent row lengths.
- **Permissive recommendation:** configurable behavior:
  - allow fewer fields and fill with null/empty,
  - allow more fields and keep as overflow array or error channel.

### 6) Empty lines vs empty single-field record ambiguity

- **Failure mode:** `\n\n` interpreted inconsistently.
- **Impact:** row count mismatches, unexpected empty records.
- **Example:**

```csv
a

b
```

- **Key design choice:** `skipEmptyLines` must be explicit and documented.

### 7) Mixed line endings in one file (`\n`, `\r\n`, `\r`)

- **Failure mode:** parser state and line counting desynchronize.
- **Impact:** broken diagnostics, split errors.
- **Recommendation:** normalize internally while preserving correctness in quoted fields.

### 8) Whitespace outside quotes

- **Failure mode:** some parsers accept, some reject.
- **Example:**

```csv
a,b
"x" ,y
```

- **Strict recommendation:** reject spaces between closing quote and delimiter if following RFC-oriented grammar.
- **Permissive recommendation:** allow with an option.

### 9) UTF-8 BOM handling

- **Failure mode:** first header becomes `\uFEFFid` instead of `id`.
- **Impact:** key lookup failures and subtle schema mismatch.
- **Recommendation:** strip BOM only at stream start; do not strip BOM in other positions.

### 10) Charset and malformed UTF-8

- **Failure mode:** decode exceptions or silent mojibake.
- **Impact:** delimiter-like bytes become data or vice versa.
- **Recommendation:** expose explicit decoding policy:
  - fail-fast mode,
  - replacement-character mode with warnings.

### 11) NUL bytes / binary content

- **Reality:** modern guidance allows binary content in `text/csv` contexts, but many text pipelines still reject NUL.
- **Failure mode:** parser crash or truncation at first NUL.
- **Recommendation:** clearly state whether NUL/binary bytes are accepted.

### 12) Duplicate header names

- **Failure mode:** object-based readers overwrite earlier columns.
- **Example:**

```csv
id,id
1,2
```

- **Recommendation:** configurable behavior:
  - reject duplicates,
  - keep as arrays,
  - auto-disambiguate (`id`, `id_2`).

### 13) Null marker vs empty string vs quoted empty string

- **Failure mode:** three semantics collapse into one value.
- **Example:**

```csv
v
NULL
""

```

- **Recommendation:** support explicit null token config and keep reversibility requirements clear.

### 14) Comment lines (`#`) and multiline field confusion

- **Failure mode:** comment logic accidentally consumes data line inside a quoted multiline field.
- **Recommendation:** comments should only be recognized outside quoted field context.

### 15) Oversized fields/rows (resource exhaustion)

- **Failure mode:** memory blowup, denial-of-service behavior.
- **Recommendation:** configurable max field size/max record size and streaming parser path.

---

## Part II: Stringifying Edge Cases

### 1) Incorrect quoting rules for special characters

- **Must quote if field contains:** delimiter, quote char, CR, or LF.
- **Failure mode:** generated CSV cannot round-trip parse.
- **Example output:**

```csv
a,b
1,"x,y"
```

### 2) Incorrect quote escaping

- **Failure mode:** output appears valid but parses incorrectly.
- **Rule:** `"` inside quoted field must be doubled to `""`.

### 3) Newline policy (`\r\n` vs `\n`) and final newline

- **Failure mode:** interop differences with strict consumers and diff tools.
- **Recommendation:** expose `recordDelimiter` config and document default; include final line break policy explicitly.

### 4) Null/undefined serialization policy

- **Failure mode:** irreversible exports (`null` indistinguishable from empty string).
- **Recommendation:** choose and document one of:
  - dedicated null token (for reversible pipelines),
  - empty string (for compatibility-first),
  - quote policy that distinguishes empty string.

### 5) CSV/formula injection (security)

- **Trigger characters:** `=`, `+`, `-`, `@`, tab, CR, LF (and some locale/full-width variants).
- **Failure mode:** spreadsheet app executes formulas when CSV is opened.
- **Recommendation:** provide opt-in spreadsheet-safe output mode that sanitizes dangerous-leading cells.

### 6) Spreadsheet type coercion corruption

- **Examples:** leading zeros dropped, long numbers truncated after 15 digits in Excel, scientific notation conversion.
- **Failure mode:** ID-like text values become different values.
- **Recommendation:** spreadsheet-targeted export mode with text-preservation strategy for sensitive columns.

### 7) Locale delimiter mismatch

- **Failure mode:** comma output imported as one column in semicolon-expecting locale.
- **Recommendation:** configurable delimiter and optional dialect metadata docs.

### 8) `sep=;` preamble interoperability

- **Reality:** helpful for some spreadsheet imports, non-standard CSV row semantically.
- **Failure mode:** treated as data row by non-spreadsheet parsers.
- **Recommendation:** keep as explicit optional compatibility mode, never default.

### 9) BOM emission decision

- **Reality:** some spreadsheet workflows require UTF-8 BOM for proper open behavior.
- **Failure mode:** without BOM, users see mojibake in specific import paths; with BOM, strict consumers may treat BOM as data if buggy.
- **Recommendation:** make BOM output configurable by target environment.

---

## Strict vs Permissive Mode Guidance

Use at least two parser modes and one writer profile:

1. **Strict mode**
   - hard error on malformed quotes,
   - fixed column count enforcement,
   - deterministic decode policy,
   - no comment magic unless configured.

2. **Permissive ingest mode**
   - tolerate common producer defects (ragged rows, whitespace quirks, mixed line endings),
   - never hide recoveries: collect warnings and counts.

3. **Spreadsheet-safe stringify mode**
   - formula-injection mitigation,
   - optional BOM,
   - explicit delimiter choice,
   - optional text-preservation for ID-like columns.

---

## Priority Test Matrix

### Must-have tests

- quoted multiline fields (valid and invalid)
- escaped quotes
- delimiter and quote round-trip
- ragged row handling policy
- BOM-in-header handling
- null vs empty vs quoted empty behavior
- CSV injection mitigation behavior (writer mode)

### Should-have tests

- mixed line endings
- duplicate headers
- whitespace-outside-quotes behavior
- invalid UTF-8 handling policy
- max field/record size guardrails
- alternate delimiter (semicolon/tab)

### Nice-to-have tests

- comment-line dialect edge cases
- bidi text samples
- NUL/binary-byte samples
- `sep=` preamble compatibility tests
- cross-tool import/export fixtures (Excel/LibreOffice/Google Sheets/PostgreSQL)

---

## High-Risk Breakpoints for Tiny CSV Libraries

If a library is intentionally small, these are the top likely breakpoints:

1. multiline quoted field state management,
2. malformed quote recovery boundaries,
3. null/empty reversibility,
4. BOM/header interactions,
5. formula injection and spreadsheet coercion hazards,
6. memory limits on hostile input.

---

## Research Sources

- RFC 4180: https://www.rfc-editor.org/rfc/rfc4180
- rfc4180-bis draft text (`-07`): https://www.ietf.org/archive/id/draft-shafranovich-rfc4180-bis-07.txt
- OWASP CSV Injection: https://owasp.org/www-community/attacks/CSV_Injection
- Python `csv` module docs: https://docs.python.org/3/library/csv.html
- PostgreSQL `COPY` docs: https://www.postgresql.org/docs/current/sql-copy.html
- W3C CSVW model: https://www.w3.org/TR/tabular-data-model/
- W3C tabular metadata: https://www.w3.org/TR/tabular-metadata/
- csv-spectrum corpus (edge-case fixture set): https://github.com/max-mapper/csv-spectrum
- Microsoft (UTF-8 CSV opening in Excel): https://support.microsoft.com/en-us/office/opening-csv-utf-8-files-correctly-in-excel-8a935af5-3416-4edd-ba7e-3dfd2bc4a032
- Microsoft (leading zeros and long-number coercion): https://support.microsoft.com/en-us/office/keeping-leading-zeros-and-large-numbers-1bf7b935-36e1-4985-842f-5dfa51f85fe7
- LibreOffice CSV filter parameters (`sep=` behavior, formula import toggle, BOM option): https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html
- Google Sheets import options (separator detection behavior): https://support.google.com/docs/answer/40608
