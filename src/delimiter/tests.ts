import { describe, expect, it } from "vitest";
import { detectDelimiter } from "./index.ts";

describe("detectDelimiter", () => {
  it("detects the delimiter", () => {
    expect(detectDelimiter(["a,b,c,d", "e,f,g,e"])).toBe(",");
  });

  it("picks the most common delimiter", () => {
    expect(detectDelimiter(["a;b;c,d", "e|f;g\te"])).toBe(";");
  });

  it("fallbacks to comma", () => {
    expect(detectDelimiter(["abcd"])).toBe(",");
  });

  it("prefers consistent delimiter", () => {
    expect(detectDelimiter(["a;b;c,d", "e|f;g,e"])).toBe(",");
    expect(detectDelimiter(["a,b,c;d", "1;2"])).toBe(";");
  });

  it("considers quoted fields", () => {
    expect(detectDelimiter(['a;b;"c,d"', "e|f;g,e"])).toBe(";");
  });
});
