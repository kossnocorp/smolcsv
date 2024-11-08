import { describe, expect, it } from "vitest";
import { parseString } from "../parse/index.ts";
import { stringifyRows } from "./index.ts";

describe("stringifyRows", () => {
  it("stringifies simple rows", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe("a,b,c\n1,2,3");
  });

  it("handles fields with commas", () => {
    const rows = [
      ["a", "b,c", "d"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe('a,"b,c",d\n1,2,3');
  });

  it("handles fields with quotes", () => {
    const rows = [
      ['He said "Hello"', "b", "c"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe('"He said ""Hello""",b,c\n1,2,3');
  });

  it("handles fields with newlines", () => {
    const rows = [
      ["a\nb", "c", "d"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe('"a\nb",c,d\n1,2,3');
  });

  it("handles empty fields", () => {
    const rows = [
      ["a", "", "c"],
      ["", "2", ""],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe("a,,c\n,2,");
  });

  it("uses custom delimiter", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows, { delimiter: ";" });
    expect(csv).toBe("a;b;c\n1;2;3");
  });

  it("handles fields with custom delimiter inside", () => {
    const rows = [
      ["a", "b;c", "d"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows, { delimiter: ";" });
    expect(csv).toBe('a;"b;c";d\n1;2;3');
  });

  it("handles fields with quotes and newlines", () => {
    const rows = [
      ['He said "Hello\nWorld"', "b", "c"],
      ["1", "2", "3"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe('"He said ""Hello\nWorld""",b,c\n1,2,3');
  });

  it("handles empty input", () => {
    const csv = stringifyRows([]);
    expect(csv).toBe("");
  });

  it("handles rows with varying lengths", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2"],
      ["x", "y", "z", "extra"],
    ];
    const csv = stringifyRows(rows);
    expect(csv).toBe("a,b,c\n1,2\nx,y,z,extra");
  });

  it("ensures round-trip consistency with parser", async () => {
    const rows = [
      ["a", "b,c", 'He said "Hello"', "d\ne", ""],
      ["1", "2", "3", "4", "5"],
    ];
    const csv = stringifyRows(rows);
    const parsed = await parseString(csv);
    expect(parsed).toEqual(rows);
  });
});
