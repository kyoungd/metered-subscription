#!/usr/bin/env node
/**
 * Generate docs/api.md from lightweight @api JSDoc blocks in route files.
 * Scans: src/app/api/**/route.js
 *
 * Block format (per method):
 * /**
 *  * @api
 *  * @method POST
 *  * @path /api/v1/subscriptions/trial
 *  * @summary Create a trial subscription
 *  * @desc Idempotent on `request_id` header. Returns trial end timestamp.
 *  * @auth bearer
 *  * @idempotency header:request_id
 *  * @units time=UTC RFC3339; money=cents
 *  * @req {json} {"orgId":"string","priceLookup":"string"}
 *  * @res 200 {json} {"subscriptionId":"string","status":"trialing","trialEndsAt":"date-time"}
 *  * @res 400 {json} {"code":"ValidationError","message":"..."}
 *  * @notes Prefer `billing/ensureStripeCustomer` before subscription creation.
 *  *\/
 * export async function POST(req) { /* ... *\/ }
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');

function getSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'local';
  }
}
const SHA = (process.env.GIT_SHA || getSha()).slice(0, 7);

const OUT = path.resolve('docs/api.md');

// find all Next.js route files
const files = glob.sync('src/app/api/**/route.js', { nodir: true });

// matches: /** ... */ export async function POST(
const blockRe = /\/\*\*([\s\S]*?)\*\/\s*export\s+async\s+function\s+([A-Z]+)\s*\(/g;

const sections = [];

for (const file of files) {
  const txt = fs.readFileSync(file, 'utf8');

  // infer path from folder if @path omitted
  const inferredPath =
    '/' +
    file
      .replace(/^src\/app\//, '')
      .replace(/\/route\.js$/, '')
      .replace(/^\//, '');

  let m;
  while ((m = blockRe.exec(txt))) {
    const raw = m[1];
    const fallbackMethod = m[2];

    // skip blocks without @api tag
    if (!/@api\b/.test(raw)) continue;

    const pick = (re, def = '') => (raw.match(re) || [null, def])[1].trim();

    const method = (pick(/@method\s+([A-Za-z]+)/, fallbackMethod) || 'GET').toUpperCase();
    const p = pick(/@path\s+([^\n]+)/, '/' + inferredPath);
    const summary = pick(/@summary\s+([^\n]+)/, '');
    const descMatch = raw.match(/@desc\s+([\s\S]*?)(?=\n\s*\*\s*@|$)/);
    const desc = (descMatch ? descMatch[1] : '').trim();
    const auth = pick(/@auth\s+([^\n]+)/, 'none');
    const idempotency = pick(/@idempotency\s+([^\n]+)/, '');
    const units = pick(/@units\s+([^\n]+)/, '');
    const req = pick(/@req\s+([^\n]+)/, '');

    const res = [...raw.matchAll(/@res\s+([0-9]{3})\s+([^\n]+)/g)].map((x) => ({
      code: x[1],
      spec: x[2].trim(),
    }));

    const notesMatch = raw.match(/@notes\s+([\s\S]*?)(?=\n\s*\*\s*@|$)/);
    const notes = (notesMatch ? notesMatch[1] : '').trim();

    sections.push({
      path: p,
      method,
      summary,
      desc,
      auth,
      idempotency,
      units,
      req,
      res,
      notes,
      file,
    });
  }
}

sections.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));

let md = `# API Reference (Derived)
Source: route.js JSDoc  @${SHA}
Generated: ${new Date().toISOString()}

`;

let currentPath = '';
for (const s of sections) {
  if (s.path !== currentPath) {
    currentPath = s.path;
    md += `## \`${s.path}\`\n`;
  }
  md += `### ${s.method} — ${s.summary || '(no summary)'}\n`;
  if (s.desc) md += `${s.desc}\n\n`;
  md += `- **Auth:** ${s.auth}\n`;
  if (s.idempotency) md += `- **Idempotency:** ${s.idempotency}\n`;
  if (s.units) md += `- **Units:** ${s.units}\n`;
  if (s.req) md += `- **Request:** ${s.req}\n`;
  if (s.res.length) {
    md += `- **Responses:**\n`;
    for (const r of s.res) md += `  - ${r.code} ${r.spec}\n`;
  }
  if (s.notes) md += `- **Notes:** ${s.notes}\n`;
  md += `- _Source: ${s.file.replace(/^src\//, '')}_\n\n`;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log('Wrote', OUT);
