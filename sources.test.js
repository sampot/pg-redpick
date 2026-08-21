import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sources smoke", () => {
  it("index.html declares redpick.v1 protocol", () => {
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
    expect(html).toMatch(/sam:protocol/);
    expect(html).toMatch(/redpick\.v1/);
  });

  it("app.js reads pg_surface and boots solo／room shells", () => {
    const src = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    expect(src).toMatch(/readPgSurface/);
    expect(src).toMatch(/tryBootAsRoomHost/);
    expect(src).toMatch(/applyRoomShell/);
  });
});
