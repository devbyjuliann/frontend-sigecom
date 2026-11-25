import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const htmlPath = join(process.cwd(), "index.html");
const faviconPath = join(process.cwd(), "public", "favicon.svg");

describe("SIGECOM favicon", () => {
  it("uses only SIGECOM as the browser tab title", () => {
    const html = readFileSync(htmlPath, "utf8");
    const titles = [...html.matchAll(/<title>(.*?)<\/title>/gi)].map(
      ([, title]) => title.trim(),
    );

    expect(titles).toEqual(["SIGECOM"]);
  });

  it("links the application document to the branded icon asset", () => {
    expect(existsSync(faviconPath)).toBe(true);

    const html = readFileSync(htmlPath, "utf8");
    const favicon = readFileSync(faviconPath, "utf8");

    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );
    expect(favicon).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(favicon).toContain("#1F3A8A");
  });
});
