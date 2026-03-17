import { parse as csvParse, stringify as csvStringify } from "csv/sync";
import {
  format as fastCsvFormat,
  parseString as fastCsvParseString,
} from "fast-csv";
import { describe, expect, it } from "vitest";
import { parseStream, parseString } from "../src/parse/index.ts";
import { stringifyRows } from "../src/stringify/index.ts";
import { Reference, parseEdgeCases, stringifyEdgeCases } from "./reference.ts";

function getDelimiter(settings: unknown): string {
  const delimiter = (settings as { delimiter?: string } | undefined)?.delimiter;
  return delimiter || ",";
}

const parseAdapters: Record<string, Reference.ParseAdapter> = {
  smolcsv: {
    parseString,
    async parseBytes(chunks, settings) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
      const rows: string[][] = [];
      for await (const row of parseStream(stream, settings as any))
        rows.push(row);
      return rows;
    },
  },
  csv: {
    async parseString(input, settings) {
      return csvParse(input, {
        delimiter: getDelimiter(settings),
      }) as string[][];
    },
    async parseBytes(chunks, settings) {
      const input = new TextDecoder().decode(joinChunks(chunks));
      return csvParse(input, {
        delimiter: getDelimiter(settings),
      }) as string[][];
    },
  },
  "fast-csv": {
    async parseString(input, settings) {
      return new Promise((resolve, reject) => {
        const rows: string[][] = [];
        const parser = fastCsvParseString(input, {
          headers: false,
          delimiter: getDelimiter(settings),
          ignoreEmpty: false,
          trim: false,
        }) as any;

        parser
          .on("error", reject)
          .on("data", (row: unknown) => {
            if (Array.isArray(row))
              rows.push(row.map((value) => String(value)));
            else
              rows.push(
                Object.values(row as Record<string, unknown>).map(String),
              );
          })
          .on("end", () => resolve(rows));
      });
    },
    async parseBytes(chunks, settings) {
      const input = new TextDecoder().decode(joinChunks(chunks));
      return new Promise((resolve, reject) => {
        const rows: string[][] = [];
        const parser = fastCsvParseString(input, {
          headers: false,
          delimiter: getDelimiter(settings),
          ignoreEmpty: false,
          trim: false,
        }) as any;

        parser
          .on("error", reject)
          .on("data", (row: unknown) => {
            if (Array.isArray(row))
              rows.push(row.map((value) => String(value)));
            else
              rows.push(
                Object.values(row as Record<string, unknown>).map(String),
              );
          })
          .on("end", () => resolve(rows));
      });
    },
  },
};

const stringifyAdapters: Record<string, Reference.StringifyAdapter> = {
  smolcsv: {
    stringify: stringifyRows,
  },
  csv: {
    async stringify(rows, settings) {
      return csvStringify(rows as string[][], {
        delimiter: getDelimiter(settings),
      });
    },
  },
  "fast-csv": {
    async stringify(rows, settings) {
      return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        const stream = fastCsvFormat({
          headers: false,
          delimiter: getDelimiter(settings),
        }) as any;

        stream.on("error", reject);
        stream.on("data", (chunk: unknown) => chunks.push(String(chunk)));
        stream.on("end", () => resolve(chunks.join("")));

        for (const row of rows) stream.write(row as any);
        stream.end();
      });
    },
  },
};

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

describe("edge-case compatibility comparison", () => {
  describe("parse", () => {
    for (const [lib, adapter] of Object.entries(parseAdapters)) {
      describe(lib, () => {
        for (const edgeCase of parseEdgeCases) {
          it(edgeCase.name, async () => {
            try {
              await edgeCase.run(adapter);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              throw new Error(
                `Why: ${edgeCase.why}\nSource: ${edgeCase.source.url}\nQuote: ${edgeCase.source.quote}\n${message}`,
              );
            }
          });
        }
      });
    }
  });

  describe("stringify", () => {
    for (const [lib, adapter] of Object.entries(stringifyAdapters)) {
      describe(lib, () => {
        for (const edgeCase of stringifyEdgeCases) {
          it(edgeCase.name, async () => {
            try {
              await edgeCase.run(adapter);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              throw new Error(
                `Why: ${edgeCase.why}\nSource: ${edgeCase.source.url}\nQuote: ${edgeCase.source.quote}\n${message}`,
              );
            }
          });
        }
      });
    }
  });

  it("registers comparison suites", () => {
    expect(Object.keys(parseAdapters).length).toBeGreaterThan(0);
    expect(Object.keys(stringifyAdapters).length).toBeGreaterThan(0);
  });
});
