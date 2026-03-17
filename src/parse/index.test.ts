import { describe, expect, it } from "vitest";
import { parseLine, parseStream, parseString } from "./index.ts";

describe("parseLine", () => {
  it("parses simple line", () => {
    const line = "a,b,c";
    expect(parseLine(line, ",")).toEqual(["a", "b", "c"]);
  });

  it("parses lines with quotes", () => {
    const line = '"a,b",c,d';
    expect(parseLine(line, ",")).toEqual(["a,b", "c", "d"]);
  });

  it("handles empty fields", () => {
    const line = "a,,c";
    expect(parseLine(line, ",")).toEqual(["a", "", "c"]);
  });

  it("handles multiline fields", () => {
    const line = '"a\nb",c';
    expect(parseLine(line, ",")).toEqual(["a\nb", "c"]);
  });

  it("handles escaped quotes", () => {
    const line = '"a""quoted""",b';
    expect(parseLine(line, ",")).toEqual(['a"quoted"', "b"]);
  });
});

describe("parseStream", () => {
  it("parses simple csv", async () => {
    const csv = "a,b,c\n1,2,3\na,s,d\n4,5,6\nz,x,c\nx,y,z";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["a", "s", "d"],
      ["4", "5", "6"],
      ["z", "x", "c"],
      ["x", "y", "z"],
    ]);
  });

  it("parses csv with quotes", async () => {
    const csv = '"a,b",c,d\n1,"2,3",4';
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a,b", "c", "d"],
      ["1", "2,3", "4"],
    ]);
  });

  it("parses csv with empty fields", async () => {
    const csv = ",b,,d\n1,,3,";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["", "b", "", "d"],
      ["1", "", "3", ""],
    ]);
  });

  it("parses csv with multiline fields", async () => {
    const csv = '"a\nb",c,d\n1,2,3';
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a\nb", "c", "d"],
      ["1", "2", "3"],
    ]);
  });

  it("parses csv with escaped quotes", async () => {
    const csv = '"a""quoted""",b\n1,2';
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ['a"quoted"', "b"],
      ["1", "2"],
    ]);
  });

  it("detects delimiter", async () => {
    const csv = "a;b;c\nd;e;f";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles empty input", async () => {
    const csv = "";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv))) {
      rows.push(row);
    }
    expect(rows).toEqual([]);
  });

  it("allows custom delimiter", async () => {
    const csv = "a,b;c,d\n1,2;3,4";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv), {
      delimiter: ";",
    })) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a,b", "c,d"],
      ["1,2", "3,4"],
    ]);
  });

  it("allows specifing delimiters", async () => {
    const csv = "a,b;c,d\n1,2;3,4";
    const rows = [];
    for await (const row of parseStream(stringToStream(csv), {
      delimiters: [";"],
    })) {
      rows.push(row);
    }
    expect(rows).toEqual([
      ["a,b", "c,d"],
      ["1,2", "3,4"],
    ]);
  });

  it("allows specifing number of lines to probe", async () => {
    const csv = "a,b,c;d\n1;2";
    const rows1 = [];
    for await (const row of parseStream(stringToStream(csv), {
      delimiterProbeLines: 1,
    })) {
      rows1.push(row);
    }
    expect(rows1).toEqual([["a", "b", "c;d"], ["1;2"]]);
    const rows2 = [];
    for await (const row of parseStream(stringToStream(csv), {
      delimiterProbeLines: 2,
    })) {
      rows2.push(row);
    }
    expect(rows2).toEqual([
      ["a,b,c", "d"],
      ["1", "2"],
    ]);
  });

  function stringToStream(input: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input));
        controller.close();
      },
    });
  }
});

describe("parseString", () => {
  it("parses csv to an array", async () => {
    const csv = "a,b,c\n1,2,3\na,s,d\n4,5,6\nz,x,c\nx,y,z";
    const rows = await parseString(csv);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["a", "s", "d"],
      ["4", "5", "6"],
      ["z", "x", "c"],
      ["x", "y", "z"],
    ]);
  });
});
