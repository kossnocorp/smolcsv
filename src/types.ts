export namespace Csv {
  /**
   * CSV row.
   */
  export type Row = string[];

  /**
   * CSV settings.
   */
  export interface Settings {
    /** Delimiter to use. */
    delimiter?: string | undefined;
  }

  /**
   * CSV parser settings.
   */
  export interface ParseSettings extends Settings {
    /** How many lines to probe when detecting delimiter (defaults to 2). */
    delimiterProbeLines?: number | undefined;
    /** Available delimiters to detect. */
    delimiters?: string[] | undefined;
  }
}
