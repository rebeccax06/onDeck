import { expect, test } from "bun:test";
import { compile } from "@vue/compiler-dom";
import { GroupCard } from "../../web/components/GroupCard.ts";
import { ActivityDetails } from "../../web/components/ActivityDetails.ts";
import { GroupPicker } from "../../web/components/GroupPicker.ts";
import { PictureEditor } from "../../web/components/PictureEditor.ts";
import { FormSurface } from "../../web/components/FormSurface.ts";
import { ConfirmDialog } from "../../web/components/ConfirmDialog.ts";
import { ActivityCard } from "../../web/components/ActivityCard.ts";

test("the actual HTML page compiles to valid Vue render JavaScript", async () => {
  const html = await Bun.file(
    new URL("../../web/index.html", import.meta.url),
  ).text();
  const template = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  expect(template).toBeDefined();
  const { code } = compile(template!, { mode: "function" });
  // Vue's runtime compiler uses Function too: this catches newlines inside
  // quoted template expressions that TypeScript does not inspect.
  expect(() => new Function("Vue", code)).not.toThrow();
});

test("the activity card template compiles to valid Vue render JavaScript", () => {
  const template = ActivityCard.template;
  if (typeof template !== "string")
    throw new Error("Expected an activity card HTML template.");
  const { code } = compile(template, { mode: "function" });
  expect(() => new Function("Vue", code)).not.toThrow();
});

test("the group card template compiles to valid Vue render JavaScript", () => {
  const template = GroupCard.template;
  if (typeof template !== "string")
    throw new Error("Expected a group card template.");
  const { code } = compile(template, { mode: "function" });
  expect(() => new Function("Vue", code)).not.toThrow();
});

for (const [name, component] of [
  ["activity details", ActivityDetails],
  ["group picker", GroupPicker],
  ["picture editor", PictureEditor],
  ["shared form", FormSurface],
  ["confirmation dialog", ConfirmDialog],
] as const) {
  test(`${name} template compiles to valid Vue render JavaScript`, () => {
    if (typeof component.template !== "string")
      throw new Error("Expected an HTML template.");
    const { code } = compile(component.template, { mode: "function" });
    expect(() => new Function("Vue", code)).not.toThrow();
  });
}
