import { defaultDelimiter } from "../delimiter/index.ts";
import type { Csv } from "../types.ts";

/**
 * Stringifies CSV rows.
 *
 * @param rows - Rows to stringify
 * @param settings - Optional settings
 *
 * @returns Stringified CSV
 */
export function stringifyRows(
  rows: Csv.Row[],
  settings?: Csv.Settings | undefined,
): string {
  const delimiter = settings?.delimiter || defaultDelimiter;

  return rows
    .map((row) =>
      row
        .map((field) => {
          if (
            field.includes('"') ||
            field.includes(delimiter) ||
            field.includes("\n")
          ) {
            return '"' + field.replace(/"/g, '""') + '"';
          }
          return field;
        })
        .join(delimiter),
    )
    .join("\n");
}
