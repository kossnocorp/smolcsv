/**
 * Default delimiters to test when detecting the delimiter of a CSV line.
 */
export const defaultDelimiters = [",", ";", "\t", "|"] as const;

/**
 * Default delimiter.
 */
export const defaultDelimiter = defaultDelimiters[0];

/**
 * Detects the delimiter used in a CSV line. It tests each passed line against
 * a set of common delimiters and returns the most common one.
 *
 * @param lines - CSV lines to detect delimiter
 * @param delimiters - Optional list of delimiters to test
 *
 * @returns The detected delimiter
 */
export function detectDelimiter(
  lines: string[],
  delimiters?: string[] | undefined
): string {
  type Candidate = [number, string];
  let max: Candidate = [0, defaultDelimiter];
  let maxConsistent: Candidate = [0, defaultDelimiter];

  for (const delimiter of delimiters || defaultDelimiters) {
    // Count the number of occurrences of the delimiter in each line
    const counts = lines.map((line) => {
      let count = 0;
      let quoted = false;

      for (let i = 0; i < line.length; i += 1) {
        // Skip quoted delimiters
        if (line[i] === '"' && !(quoted && line[i + 1] === '"')) {
          quoted = !quoted;
          break;
        }

        if (line.slice(i, i + delimiter.length) === delimiter) count += 1;
      }

      return count;
    });

    // What's the minimal count of the delimiter in a line?
    let minCount = -1;
    // If the number of delimiters in each line is consistent?
    let consistent = true;
    for (const count of counts) {
      if (minCount === -1 || count < minCount) minCount = count;
      if (count !== counts[0]) consistent = false;
    }

    // Set most frequent consistent delimiter
    if (consistent && minCount > maxConsistent[0])
      maxConsistent = [minCount, delimiter];

    // Set most frequent delimiter
    if (minCount > max[0]) max = [minCount, delimiter];
  }

  // Prefer consistent delimiter over frequent
  if (maxConsistent[0]) return maxConsistent[1];

  return max[1];
}
