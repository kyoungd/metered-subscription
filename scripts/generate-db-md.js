#!/usr/bin/env node
/**
 * Generate docs/db_schema.md from schema.prisma.
 * Reads inline trailing triple-slash comments `///` on model fields and enums.
 *
 * Example:
 * model Entitlement {
 *   id        String   @id @default(cuid())   /// primary key
 *   plan      Plan                            /// enum: FLAT
 * }
 * enum Plan {
 *   FLAT      /// single flat monthly plan
 * }
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getSha() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "local";
  }
}
const SHA = (process.env.GIT_SHA || getSha()).slice(0, 7);

const SRC = path.resolve("schema.prisma");
const OUT = path.resolve("docs/db_schema.md");

if (!fs.existsSync(SRC)) {
  console.error(`schema.prisma not found at ${SRC}`);
  process.exit(1);
}

const text = fs.readFileSync(SRC, "utf8");

let md = `# Database Schema (Derived)
Source: schema.prisma@${SHA}
Generated: ${new Date().toISOString()}

`;

// Models
const modelBlocks = [...text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
for (const match of modelBlocks) {
  const name = match[1];
  const body = match[2];

  md += `## ${name}\n`;

  // fields: start of line, name + type; capture trailing /// doc if any
  const fields = [
    ...body.matchAll(/^\s*(\w+)\s+([^\/\n]+?)(?:\s+\/\/\/\s*(.*))?\s*$/gm),
  ];
  for (const f of fields) {
    const fname = f[1];
    const ftype = f[2].trim();
    const fdoc = (f[3] || "").trim();
    if (!fname || fname.startsWith("//")) continue;
    md += `- \`${fname}\`: \`${ftype}\`${fdoc ? ` — ${fdoc}` : ""}\n`;
  }
  md += `\n`;
}

// Enums
const enumBlocks = [...text.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
if (enumBlocks.length) {
  md += `## Enums\n`;
  for (const match of enumBlocks) {
    const ename = match[1];
    const body = match[2];
    md += `### ${ename}\n`;
    const members = [...body.matchAll(/^\s*(\w+)(?:\s+\/\/\/\s*(.*))?\s*$/gm)];
    for (const m of members) {
      const mname = m[1];
      if (!mname || mname.startsWith("//")) continue;
      const mdoc = (m[2] || "").trim();
      md += `- \`${mname}\`${mdoc ? ` — ${mdoc}` : ""}\n`;
    }
    md += `\n`;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log("Wrote", OUT);
