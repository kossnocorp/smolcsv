import { expect } from "vitest";

export namespace Reference {
  export interface Source<TAdapter> {
    name: string;
    why: string;
    source: CaseSource;
    pending?: boolean;
    run(adapter: TAdapter): Promise<void>;
  }

  export interface CaseSource {
    url: string;
    quote: string;
  }

  export interface ParseAdapter {
    parseString(input: string, settings?: unknown): Promise<string[][]>;
    parseBytes?: (
      chunks: Uint8Array[],
      settings?: unknown,
    ) => Promise<string[][]>;
  }

  export interface StringifyAdapter {
    stringify(rows: unknown[][], settings?: unknown): Promise<string> | string;
  }
}

export const parseEdgeCases: Reference.Source<Reference.ParseAdapter>[] = [
  {
    name: "keeps empty physical lines as empty rows",
    why: "Prevents silent row count drift when empty lines are meaningful data rows.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.3",
      quote:
        "This specification recommends but doesn't require having the same number of fields in every line. This allows CSV files to have empty lines without any fields at all.",
    },
    async run({ parseString }) {
      const rows = await parseString("a\n\n\nb", { delimiter: "," });
      expect(rows).toEqual([["a"], [""], [""], ["b"]]);
    },
  },

  {
    name: "treats comment-like lines as data by default",
    why: "CSV has no standard comment syntax; comment handling must be explicit.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.11",
      quote:
        'Some implementations may use the hash sign ("#") to mark lines that are meant to be commented lines.',
    },
    async run({ parseString }) {
      const rows = await parseString("#meta\na,b\n1,2");
      expect(rows).toEqual([["#meta"], ["a", "b"], ["1", "2"]]);
    },
  },

  {
    name: "parses fields containing NUL bytes",
    why: "Binary-ish payloads can appear in CSV streams in real pipelines.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-2.3",
      quote:
        "textdata = %x00-09 / %x0B-0C / %x0E-21 / %x23-2B / %x2D-7F / UTF8-data",
    },
    async run({ parseString }) {
      const rows = await parseString(`a,b\n1,${"\0"}x`);
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "\0x"],
      ]);
    },
  },

  {
    name: "keeps duplicate headers as-is",
    why: "Duplicate header policy must be explicit; dropping/overwriting is dangerous.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.5",
      quote:
        "Implementers should be aware that some applications may treat header values as unique (either case-sensitive or case-insensitive).",
    },
    async run({ parseString }) {
      const rows = await parseString("id,id\n1,2");
      expect(rows).toEqual([
        ["id", "id"],
        ["1", "2"],
      ]);
    },
  },

  {
    name: "preserves explicit null markers and empty variants as raw strings",
    why: "Distinguishing NULL vs empty string is a common data integrity requirement.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.1",
      quote:
        "Some implementations (such as databases) treat empty fields and null values differently.",
    },
    async run({ parseString }) {
      const rows = await parseString('v\nNULL\n""\n', { delimiter: "," });
      expect(rows).toEqual([["v"], ["NULL"], [""]]);
    },
  },

  {
    name: "uses replacement characters for invalid UTF-8 bytes",
    why: "Decode behavior must be deterministic when ingesting malformed byte streams.",
    source: {
      url: "https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode#exceptions",
      quote:
        "A TypeError is thrown if there is a decoding error when the property TextDecoder.fatal is true.",
    },
    async run({ parseBytes }) {
      if (!parseBytes) {
        throw new Error(
          "UNSUPPORTED: adapter does not support byte-level parsing",
        );
      }

      const rows = await parseBytes(
        [
          Uint8Array.from([0x61, 0x2c, 0x62, 0x0a, 0x31, 0x2c]),
          Uint8Array.from([0xc3, 0x28, 0x0a]),
        ],
        { delimiter: "," },
      );

      expect(rows).toEqual([
        ["a", "b"],
        ["1", "�("],
      ]);
    },
  },

  {
    name: "strict mode rejects unclosed quotes at EOF with structured error",
    why: "Malformed quote termination can silently corrupt the tail of large files.",
    source: {
      url: "https://www.rfc-editor.org/rfc/rfc4180#section-2",
      quote: "escaped = DQUOTE *(TEXTDATA / COMMA / CR / LF / 2DQUOTE) DQUOTE",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString('a,b\n1,"oops', { delimiter: ",", strict: true } as any),
      ).rejects.toMatchObject({ code: "CSV_UNCLOSED_QUOTE", line: 2 });
    },
  },

  {
    name: "strict mode rejects bare quotes in unquoted fields",
    why: "Bare quote acceptance differs across libs and causes nondeterministic parsing.",
    source: {
      url: "https://www.rfc-editor.org/rfc/rfc4180#section-2",
      quote:
        "If fields are not enclosed with double quotes, then double quotes may not appear inside the fields.",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString('a,b\n1,ab"cd', { delimiter: ",", strict: true } as any),
      ).rejects.toMatchObject({ code: "CSV_BARE_QUOTE", line: 2, column: 2 });
    },
  },

  {
    name: "strict mode rejects mixed line endings",
    why: "Mixed CR/LF forms often indicate damaged transport or concatenated files.",
    source: {
      url: "https://www.postgresql.org/docs/current/sql-copy.html#SQL-COPY-TEXT-FORMAT",
      quote:
        "COPY FROM will complain if the line endings in the input are not all alike.",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString("a,b\n1,2\r\n3,4\r5,6", {
          delimiter: ",",
          strict: true,
          lineEndings: "consistent",
        } as any),
      ).rejects.toMatchObject({ code: "CSV_MIXED_LINE_ENDINGS" });
    },
  },

  {
    name: "strict mode rejects whitespace after closing quote",
    why: "Trailing garbage after closing quotes should not be silently consumed.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.6",
      quote:
        "When quoted fields are used, this document does not allow whitespace between double quotes and commas.",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString('a,b\n"x" ,y', { delimiter: ",", strict: true } as any),
      ).rejects.toMatchObject({
        code: "CSV_TRAILING_CHARS_AFTER_QUOTE",
        line: 2,
      });
    },
  },

  {
    name: "strips UTF-8 BOM from first header field",
    why: "BOM leakage into the first header key breaks downstream column mapping.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.9",
      quote:
        "Some applications might be able to read and properly interpret such a header, others could break.",
    },
    pending: true,
    async run({ parseString }) {
      const rows = await parseString("\uFEFFid,name\n1,A", {
        delimiter: ",",
        bom: "strip",
      } as any);

      expect(rows).toEqual([
        ["id", "name"],
        ["1", "A"],
      ]);
    },
  },

  {
    name: "strict decode mode throws on malformed UTF-8",
    why: "Some pipelines need fail-fast decoding instead of replacement to protect data quality.",
    source: {
      url: "https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal",
      quote:
        "A boolean indicating whether the error mode is fatal. If true, decoding errors result in a TypeError.",
    },
    pending: true,
    async run({ parseBytes }) {
      if (!parseBytes) {
        throw new Error(
          "UNSUPPORTED: adapter does not support byte-level parsing",
        );
      }

      await expect(
        parseBytes(
          [
            Uint8Array.from([0x61, 0x2c, 0x62, 0x0a, 0x31, 0x2c]),
            Uint8Array.from([0xc3, 0x28, 0x0a]),
          ],
          { delimiter: ",", decodeMode: "strict" } as any,
        ),
      ).rejects.toMatchObject({ code: "CSV_DECODE_ERROR" });
    },
  },

  {
    name: "enforces strict row-shape validation on ragged rows",
    why: "Schema-sensitive imports need deterministic column counts.",
    source: {
      url: "https://www.rfc-editor.org/rfc/rfc4180#section-2",
      quote:
        "Each line should contain the same number of fields throughout the file.",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString("a,b,c\n1,2\n3,4,5,6", {
          delimiter: ",",
          enforceColumnCount: true,
        } as any),
      ).rejects.toMatchObject({ code: "CSV_RAGGED_ROW", line: 2 });
    },
  },

  {
    name: "supports configurable null tokens distinct from empty strings",
    why: "NULL token semantics are common in ETL and database exports.",
    source: {
      url: "https://www.postgresql.org/docs/current/sql-copy.html#SQL-COPY-CSV-FORMAT",
      quote:
        "The CSV format has no standard way to distinguish a NULL value from an empty string. PostgreSQL's COPY handles this by quoting.",
    },
    pending: true,
    async run({ parseString }) {
      const rows = await parseString('v\nNULL\n""\n', {
        delimiter: ",",
        nullTokens: ["NULL"],
      } as any);

      expect(rows).toEqual([["v"], [null], [""]]);
    },
  },

  {
    name: "supports comment mode that ignores comments only outside quotes",
    why: "Comment stripping must not destroy content inside multiline quoted fields.",
    source: {
      url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-3.11",
      quote:
        "Comments should not be confused with a subsequent line of a multi-line field.",
    },
    pending: true,
    async run({ parseString }) {
      const rows = await parseString(
        ["#meta", '"line1\n#not-comment",x', "1,2"].join("\n"),
        {
          delimiter: ",",
          comment: "#",
        } as any,
      );

      expect(rows).toEqual([
        ["line1\n#not-comment", "x"],
        ["1", "2"],
      ]);
    },
  },

  {
    name: "enforces max field size limits",
    why: "Bounded field size is a key mitigation against memory exhaustion inputs.",
    source: {
      url: "https://docs.python.org/3/library/csv.html#csv.field_size_limit",
      quote: "csv.field_size_limit([new_limit])",
    },
    pending: true,
    async run({ parseString }) {
      await expect(
        parseString(`a,b\n1,${"x".repeat(128)}`, {
          delimiter: ",",
          maxFieldLength: 64,
        } as any),
      ).rejects.toMatchObject({
        code: "CSV_FIELD_TOO_LARGE",
        line: 2,
        column: 2,
      });
    },
  },
];

export const stringifyEdgeCases: Reference.Source<Reference.StringifyAdapter>[] =
  [
    {
      name: "quotes fields containing carriage returns",
      why: "CR must trigger quoting to preserve row boundaries across consumers.",
      source: {
        url: "https://www.postgresql.org/docs/current/sql-copy.html#SQL-COPY-CSV-FORMAT",
        quote:
          "If the value contains ... a carriage return, or line feed character, then the whole value is prefixed and suffixed by the QUOTE character.",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify([["a\rb", "c"]]);
        expect(csv).toBe('"a\rb",c');
      },
    },

    {
      name: "supports configurable record delimiters (LF/CRLF)",
      why: "Some consumers require CRLF outputs for compatibility.",
      source: {
        url: "https://www.rfc-editor.org/rfc/rfc4180#section-2",
        quote:
          "Each record is located on a separate line, delimited by a line break (CRLF).",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["a", "b"],
            ["1", "2"],
          ],
          { delimiter: ",", recordDelimiter: "\r\n" } as any,
        );

        expect(csv).toBe("a,b\r\n1,2");
      },
    },

    {
      name: "supports configurable trailing newline emission",
      why: "Final newline handling differs between specs and consuming tools.",
      source: {
        url: "https://datatracker.ietf.org/doc/html/draft-shafranovich-rfc4180-bis-07#section-2.1",
        quote:
          "The last record in the file MUST have an ending line break indicating the end of a record.",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["a", "b"],
            ["1", "2"],
          ],
          { delimiter: ",", trailingNewline: true } as any,
        );

        expect(csv).toBe("a,b\n1,2\n");
      },
    },

    {
      name: "supports reversible null serialization policy",
      why: "Export pipelines often need null values distinct from empty strings.",
      source: {
        url: "https://www.postgresql.org/docs/current/sql-copy.html#SQL-COPY-CSV-FORMAT",
        quote:
          'A NULL is output as the NULL parameter string and is not quoted, while an empty string data value is written with double quotes ("").',
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["id", "v"],
            ["1", null],
            ["2", ""],
          ],
          { delimiter: ",", nullToken: "NULL" } as any,
        );

        expect(csv).toBe('id,v\n1,NULL\n2,""');
      },
    },

    {
      name: "spreadsheet-safe mode sanitizes formula-injection-leading characters",
      why: "Cells starting with =,+,-,@,tab can execute formulas in spreadsheet apps.",
      source: {
        url: "https://owasp.org/www-community/attacks/CSV_Injection#overview",
        quote:
          "This attack can be used when untrusted input is included in a CSV file and interpreted by spreadsheet software.",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [["=SUM(A1:A2)", "+1", "-2", "@foo", "\tcmd"]],
          {
            delimiter: ",",
            spreadsheetSafe: true,
          } as any,
        );

        expect(csv).toBe('"\'=SUM(A1:A2)","\'+1","\'-2","\'@foo","\'\tcmd"');
      },
    },

    {
      name: "spreadsheet-safe mode preserves leading zeros and long IDs",
      why: "Spreadsheet import often strips leading zeros and truncates long numeric strings.",
      source: {
        url: "https://support.microsoft.com/en-us/office/keeping-leading-zeros-and-large-numbers-1bf7b935-36e1-4985-842f-5dfa51f85fe7",
        quote:
          "Excel automatically converts large numbers to scientific notation and removes leading zeros.",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["id", "zip", "cc"],
            ["1", "00123", "12345678901234567"],
          ],
          {
            delimiter: ",",
            spreadsheetSafe: true,
            textColumns: ["zip", "cc"],
          } as any,
        );

        expect(csv).toBe('id,zip,cc\n1,"\'00123","\'12345678901234567"');
      },
    },

    {
      name: "supports optional sep= preamble for spreadsheet-targeted exports",
      why: "Some spreadsheet import flows use sep= preamble to pick delimiter.",
      source: {
        url: "https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html#special-case-of-csv-files-with-separator-defined-in-the-first-line",
        quote:
          'CSV import and export support a sep= and "sep=" field separator setting.',
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["a", "b"],
            ["1", "2"],
          ],
          { delimiter: ";", includeSepPreamble: true } as any,
        );

        expect(csv).toBe("sep=;\na;b\n1;2");
      },
    },

    {
      name: "supports optional UTF-8 BOM emission",
      why: "BOM output is needed in some spreadsheet-centric UTF-8 workflows.",
      source: {
        url: "https://support.microsoft.com/en-us/office/opening-csv-utf-8-files-correctly-in-excel-8a935af5-3416-4edd-ba7e-3dfd2bc4a032",
        quote:
          "You can open a CSV file encoded with UTF-8 normally if it was saved with BOM (Byte Order Mark).",
      },
      pending: true,
      async run({ stringify }) {
        const csv = await stringify(
          [
            ["id", "name"],
            ["1", "Renée"],
          ],
          { delimiter: ",", bom: true } as any,
        );

        expect(csv).toBe("\uFEFFid,name\n1,Renée");
      },
    },
  ];
