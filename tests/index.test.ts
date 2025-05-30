// tests/index.test.ts

import { describe, it, expect } from "vitest";
import { TSArgParser } from "../src/index.js";

describe("TSArgParser", () => {
  it("should parse with no arguments", () => {
    const args = TSArgParser({});

    const resultNoArgs = args.parse(["node", "script.js"]);
    expect(resultNoArgs).toEqual({ ok: {} });

    const resultUnrecognizedLongOption = args.parse([
      "node",
      "script.js",
      "--unknown-flag",
    ]);
    expect(resultUnrecognizedLongOption).toEqual({
      error: "Unrecognized option --unknown-flag",
    });
  });

  it("should parse string arguments", () => {
    const args = TSArgParser({
      name: { type: "string" },
    });

    const resultNoArgs = args.parse(["node", "script.js"]);

    expect(resultNoArgs).toEqual({ ok: {} });

    const result = args.parse(["node", "script.js", "--name", "test"]);

    expect("ok" in result && result.ok.name === "test").toBeTruthy();

    expect(result).toEqual({ ok: { name: "test" } });
  });
});
