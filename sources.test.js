import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sources smoke", () => {
  it("index.html declares redpick.v1 protocol", () => {
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
    expect(html).toMatch(/sam:protocol/);
    expect(html).toMatch(/redpick\.v1/);
    expect(html).toMatch(/data-layout="setup"/);
  });

  it("player-facing description does not lead with protocol id", () => {
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
    const desc = html.match(/name="description"\s+content="([^"]*)"/);
    expect(desc?.[1] || "").not.toMatch(/redpick\.v1/);
  });

  it("app.js reads pg_surface and boots solo／room shells", () => {
    const src = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    expect(src).toMatch(/readPgSurface/);
    expect(src).toMatch(/tryBootAsRoomHost/);
    expect(src).toMatch(/applyRoomShell/);
  });

  it("awaits PG.ready before boot", () => {
    const src = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    expect(src).toMatch(/pg\.ready/);
    expect(src).toMatch(/async function boot\(/);
  });

  it("suspends AI／audio／selection on visibility hidden (§3.5)", () => {
    const src = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    expect(src).toMatch(/visibilitychange/);
    expect(src).toMatch(/pagehide/);
    expect(src).toMatch(/function suspendGame\(/);
    expect(src).toMatch(/function resumeGame\(/);
  });

  it("syncLayoutChrome derives data-layout from chrome state (§3.6)", () => {
    const src = readFileSync(new URL("./app.js", import.meta.url), "utf8");
    expect(src).toMatch(/deriveChromeState/);
    expect(src).toMatch(/dataset\.layout/);
    expect(src).toMatch(/function syncLayoutChrome\(/);
  });

  it("styles collapse hero／rules in match and reflow short landscape (§3.7)", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/data-layout=["']match["'][\s\S]*?\.hero/);
    expect(css).toMatch(
      /orientation:\s*landscape\)\s+and\s+\(max-height:\s*560px\)/,
    );
  });

  it("sam-manifest lists runtime modules including lifecycle／ui-state", () => {
    const man = JSON.parse(
      readFileSync(new URL("./sam-manifest.json", import.meta.url), "utf8"),
    );
    expect(man.version).toBe(1);
    expect(man.files).toContain("index.html");
    expect(man.files).toContain("lifecycle.js");
    expect(man.files).toContain("ui-state.js");
    expect(man.files).toContain("shellSurface.js");
  });
});
