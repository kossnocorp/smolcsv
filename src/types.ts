/**
 * CSV row.
 */
export type CSVRow = string[];

/**
 * CSV settings.
 */
export interface CSVSettings {
  /** Delimiter to use. */
  delimiter?: string | undefined;
}
