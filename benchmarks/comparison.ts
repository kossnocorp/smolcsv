import b from "benny";
import { parse as csvParse, stringify as csvStringify } from "csv/sync";
import {
  format as fastCsvFormat,
  parseString as fastCsvParseString,
} from "fast-csv";
import { parseString } from "../src/parse/index.ts";
import { stringifyRows } from "../src/stringify/index.ts";

const csvInput = [
  "id,name,note",
  '1,Alice,"hello, world"',
  '2,Bob,"line1\nline2"',
  '3,Charlie,"He said ""hi"""',
].join("\n");

const rows = [
  ["id", "name", "note"],
  ["1", "Alice", "hello, world"],
  ["2", "Bob", "line1\nline2"],
  ["3", "Charlie", 'He said "hi"'],
];

function parseWithFastCsv(input: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const parsedRows: string[][] = [];
    const parser = fastCsvParseString(input, {
      headers: false,
      delimiter: ",",
      ignoreEmpty: false,
      trim: false,
    }) as any;

    parser
      .on("error", reject)
      .on("data", (row: unknown) => {
        if (Array.isArray(row))
          parsedRows.push(row.map((value) => String(value)));
        else
          parsedRows.push(
            Object.values(row as Record<string, unknown>).map(String),
          );
      })
      .on("end", () => resolve(parsedRows));
  });
}

function stringifyWithFastCsv(inputRows: string[][]): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const formatter = fastCsvFormat({
      headers: false,
      delimiter: ",",
    }) as any;

    formatter.on("error", reject);
    formatter.on("data", (chunk: unknown) => chunks.push(String(chunk)));
    formatter.on("end", () => resolve(chunks.join("")));

    for (const row of inputRows) formatter.write(row);
    formatter.end();
  });
}

void b.suite(
  "parse comparison",

  b.add("smolcsv.parseString", async () => {
    await parseString(csvInput, { delimiter: "," });
  }),

  b.add("csv/sync.parse", () => {
    csvParse(csvInput, { delimiter: "," });
  }),

  b.add("fast-csv.parseString", async () => {
    await parseWithFastCsv(csvInput);
  }),

  b.cycle(),
  b.complete(),
);

void b.suite(
  "stringify comparison",

  b.add("smolcsv.stringifyRows", () => {
    stringifyRows(rows);
  }),

  b.add("csv/sync.stringify", () => {
    csvStringify(rows);
  }),

  b.add("fast-csv.format", async () => {
    await stringifyWithFastCsv(rows);
  }),

  b.cycle(),
  b.complete(),
);
