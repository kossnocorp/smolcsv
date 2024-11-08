import b from "benny";
import { detectDelimiter } from "./src/delimiter/index.ts";

const lines = ["a;b;c,d", "e|f;g,e"];

b.suite(
  "detectDelimiter",

  b.add("Default delimiters", () => {
    detectDelimiter(lines);
  }),

  b.cycle(),
  b.complete()
);
