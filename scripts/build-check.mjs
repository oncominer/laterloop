import { access, readFile } from "node:fs/promises";

const required = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "src/config.js",
  "netlify/functions/send-unlock-code.js",
  "netlify/functions/reveal-capsule.js",
  "supabase/schema.sql"
];

await Promise.all(required.map((file) => access(file)));

const html = await readFile("index.html", "utf8");
if (!html.includes("src/app.js") || !html.includes("src/styles.css")) {
  throw new Error("index.html is missing app assets");
}

console.log("Build check passed.");
