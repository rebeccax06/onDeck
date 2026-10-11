import { expect, test } from "bun:test";
import { compile } from "@vue/compiler-dom";
import { ActivityCard } from "../../web/components/ActivityCard.ts";

test("the actual HTML page compiles to valid Vue render JavaScript", async () => {
  const html = await Bun.file(new URL("../../web/index.html", import.meta.url)).text();
  const template = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  expect(template).toBeDefined();
  const { code } = compile(template!, { mode: "function" });
  // Vue's runtime compiler uses Function too: this catches newlines inside
  // quoted template expressions that TypeScript does not inspect.
  expect(() => new Function("Vue", code)).not.toThrow();
});

test("the activity card template compiles to valid Vue render JavaScript", () => {
  const template = ActivityCard.template;
  if (typeof template !== "string") throw new Error("Expected an activity card HTML template.");
  const { code } = compile(template, { mode: "function" });
  expect(() => new Function("Vue", code)).not.toThrow();
});
