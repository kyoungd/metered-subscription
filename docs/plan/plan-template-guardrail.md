
---

## 7) CI Guard (recommended)

**.github/workflows/plan-context-guard.yml**

```yaml
name: Plan Context Guard
on:
  pull_request:
    paths:
      - 'docs/**/*.context.json'
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate required fields
        run: |
          set -e
          jq -e '(
            .schema_version and .story_id and .step_id and .endpoint and .goal and
            (.acceptance|length>0) and (.invariants|length>0) and (.touch_set|length>0) and
            (.reuse_first|length>=0) and (.non_goals) and (.loc_budget) and (.required_headers|length>0) and
            (.security) and (.side_effects) and (.test_matrix|length>0) and (.rollback) and (.sources|length>0) and
            (.touch_set_mode) and (.reuse_mode)
          )' docs/**/*.context.json > /dev/null

      - name: Reject proposed touch or reuse sets
        run: |
          set -e
          if jq -e 'select(.touch_set_mode=="proposed" or .reuse_mode=="proposed")' docs/**/*.context.json >/dev/null; then
            echo "Context has proposed sets. Human must review & set to locked before merge."
            exit 1
          fi

      - name: Enforce allowed touch_set paths (TS-first; allow JS only if present)
        run: |
          set -e
          node - <<'NODE'
          const fs=require('fs'), cp=require('child_process'), path=require('path');
          const files = cp.execSync("ls docs/*.context.json || true").toString().trim().split("\n").filter(Boolean);
          const ok = /^src\/app\/api\/.+\/route\.(ts|js)$|^tests\/integration\/api\..+\.test\.(ts|js)$|^docs\/api\.md$/;
          let bad=[];
          for(const f of files){
            const j = JSON.parse(fs.readFileSync(f,'utf8'));
            const ts = j.touch_set||[];
            const rationale = (j.touch_set_rationale||"").toLowerCase();
            const hasException = rationale.includes("exception_request");
            for(const p of ts){
              if(!ok.test(p) && !hasException){ bad.push(`${f}: ${p}`); }
              // TS-first preference: warn if proposing .js when a .ts peer is possible
              if(p.endsWith('/route.js') && fs.existsSync(p.replace(/\.js$/, '.ts'))){
                bad.push(`${f}: prefers route.ts over existing route.js when TS peer exists`);
              }
              if(p.endsWith('.test.js') && fs.existsSync(p.replace(/\.test\.js$/, '.test.ts'))){
                bad.push(`${f}: prefers .test.ts over .test.js when TS peer exists`);
              }
            }
          }
          if(bad.length){ console.error("Touch set issues:\n"+bad.join("\n")); process.exit(1); }
          NODE

      - name: Verify reuse_first symbols exist (lightweight)
        run: |
          set -e
          node - <<'NODE'
          const fs=require('fs'), cp=require('child_process'), path=require('path');
          const files = cp.execSync("ls docs/*.context.json || true").toString().trim().split("\n").filter(Boolean);
          const roots = ['docs/library.md','src/lib','src/app']; // scan surfaces
          function scanText(p){ try{ return fs.readFileSync(p,'utf8'); } catch{ return ''; } }
          function listFiles(dir){
            let out=[]; try{
              for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
                const p=path.join(dir,entry.name);
                if(entry.isDirectory()) out=out.concat(listFiles(p));
                else out.push(p);
              }
            }catch{}
            return out;
          }
          const haystack = roots.flatMap(r => {
            if(fs.existsSync(r) && fs.lstatSync(r).isDirectory()) return listFiles(r);
            return fs.existsSync(r) ? [r] : [];
          }).map(scanText).join('\n');
          let missing=[];
          for(const f of files){
            const j = JSON.parse(fs.readFileSync(f,'utf8'));
            const symbols = j.reuse_first||[];
            for(const s of symbols){
              const re = new RegExp(`\\b${s}\\b`);
              if(!re.test(haystack)) missing.push(`${f}: ${s}`);
            }
          }
          if(missing.length){
            console.error("reuse_first symbols not found in docs/library.md or src/lib/**/src/app/** (approx scan):\n"+missing.join("\n"));
            process.exit(1);
          }
          NODE
```
