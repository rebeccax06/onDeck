const result = await Bun.build({
  entrypoints: [new URL("../web/styles.css", import.meta.url).pathname],
  target: "browser",
});
if (!result.success) {
  for (const diagnostic of result.logs) console.error(diagnostic);
  process.exit(1);
}
console.log("Frontend stylesheet bundle check passed.");
