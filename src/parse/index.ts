import { defaultDelimiter, detectDelimiter } from "../delimiter/index.ts";
import { CSVRow, CSVSettings } from "../types.ts";

/**
 * CSV parser settings.
 */
export interface CSVParseSettings extends CSVSettings {
  /** How many lines to probe when detecting delimiter (defaults to 2). */
  delimiterProbeLines?: number | undefined;
  /** Available delimiters to detect. */
  delimiters?: string[] | undefined;
}

/**
 * Parses a CSV line into an array of fields.
 *
 * @param line - The line to parse
 * @param delimiter - The delimiter to use, it should be know in advance
 *
 * @returns Array of fields
 */
export function parseLine(line: string, delimiter: string): CSVRow {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        // It's an escaped quote
        field += '"';
        i++;
      } else {
        // Toggle state
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      // End of field
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  // Add the last field
  fields.push(field);

  return fields;
}

/**
 * Parses a CSV stream into an async iterable of rows.
 *
 * @param stream - Stream to parse
 * @param settings - Optional parser settings
 *
 * @returns Async iterable of parsed rows
 */
export function parseStream(
  stream: ReadableStream<Uint8Array>,
  settings?: CSVParseSettings | undefined
): AsyncIterable<CSVRow> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  let buffer = "";
  let detectedDelimiter = !!settings?.delimiter;
  let delimiter = settings?.delimiter || defaultDelimiter;
  let quoted = false;

  async function* parseRows() {
    let linesToParse: string[] = [];

    // Ensure the delimiter is detected by probing the first lines.
    function ensureDelimiter() {
      const lines = linesToParse.slice(0, settings?.delimiterProbeLines || 2);
      delimiter = detectDelimiter(lines, settings?.delimiters);
      detectedDelimiter = true;
    }

    // Parse the lines in the buffer. Rather than parsing then one by one, we
    // accumulate them, so we can avoid extra parsing when detecting
    // the delimiter.
    async function* parseLines() {
      for (const line of linesToParse) {
        yield parseLine(line, delimiter);
      }
      linesToParse = [];
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];

        if (char === '"') {
          quoted = !quoted;
        } else if (char === "\n" && !quoted) {
          const line = buffer.slice(start, i);
          start = i + 1;
          linesToParse.push(line);
        }

        if (detectedDelimiter) yield* parseLines();
        else if (linesToParse.length >= (settings?.delimiterProbeLines || 3))
          ensureDelimiter();
      }

      buffer = buffer.slice(start);
    }

    // Handle the remaining buffer if there's data left
    if (buffer.length) {
      linesToParse.push(buffer);
      if (!detectedDelimiter) ensureDelimiter();
      yield* parseLines();
    }
  }

  return parseRows();
}

/**
 * Parses a CSV string into an array of rows.
 *
 * @param input - The CSV string to parse
 * @param settings - Optional parser settings
 *
 * @returns Array of rows
 */
export async function parseString(
  input: string,
  settings?: CSVParseSettings
): Promise<CSVRow[]> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });
  const rows = [];
  for await (const row of parseStream(stream, settings)) {
    rows.push(row);
  }
  return rows;
}
