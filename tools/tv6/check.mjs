#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const root = path.resolve(args[0] || "assets/tichu_v6");
const lockPath = path.resolve(args.includes("--lock") ? args[args.indexOf("--lock")+1] : "lock.json");
const snapPath = args.includes("--snap") ? path.resolve(args[args.indexOf("--snap")+1]) : null;
const noHash = args.includes("--no-hash");
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("OK:", m);
const must = (cond,m)=>{ if(!cond) fail(m); };
const readJson = (p)=>JSON.parse(fs.readFileSync(p,"utf8"));
const exists = (p)=>fs.existsSync(path.join(root,p));
const file = (p)=>path.join(root,p);
const sha = (p)=>crypto.createHash("sha256").update(fs.readFileSync(file(p))).digest("hex");
function pngDim(rel){
  const b = fs.readFileSync(file(rel));
  must(b.length >= 24, `${rel} is too small`);
  must(b[0]===0x89 && b.toString("ascii",1,4)==="PNG", `${rel} is not PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
function eq(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
function loadLock(){
  if (!fs.existsSync(lockPath)) fail(`missing lock file ${lockPath}`);
  return readJson(lockPath);
}
const lock = loadLock();
for (const p of Object.values(lock.paths)) must(exists(p), `missing ${p}`);
for (const p of [lock.paths.table, lock.paths.prod_overlay, lock.paths.slots, lock.paths.arrows, lock.paths.debug]) {
  must(eq(pngDim(p), lock.must.table_px), `${p} must be ${lock.must.table_px.join("x")}`);
}
const anchors = readJson(file(lock.paths.anchors));
must(anchors.design_px?.w === lock.design.w && anchors.design_px?.h === lock.design.h, "anchor design px wrong");
must(Array.isArray(anchors.anchors), "anchors.anchors missing");
must(anchors.anchors.length === lock.must.anchors, `expected ${lock.must.anchors} anchors`);
const byId = Object.fromEntries(anchors.anchors.map(a=>[a.id,a]));
for (const [id,dir] of Object.entries(lock.direction)) {
  const a = byId[id];
  must(a, `missing anchor ${id}`);
  must(a.arrow_direction === dir, `${id} direction ${a.arrow_direction} != ${dir}`);
  must(a.slot_orientation === lock.orientation[id], `${id} orientation ${a.slot_orientation} != ${lock.orientation[id]}`);
  must(a.slot_rotation_deg === lock.rotation[id], `${id} rotation ${a.slot_rotation_deg} != ${lock.rotation[id]}`);
  must(a.bbox_px && Number.isFinite(a.bbox_px.x) && a.bbox_px.w > 0 && a.bbox_px.h > 0, `${id} has bad bbox`);
}
for (let i=1;i<=12;i++) {
  const n = String(i).padStart(2,"0");
  must(exists(`p/m/${n}.png`), `missing mask ${n}`);
  must(exists(`p/i/${n}.png`), `missing slot img ${n}`);
}
const cmap = readJson(file(lock.paths.cards));
let std=0, sp=0, back=0;
for (const suit of Object.keys(cmap.standard||{})) for (const rank of Object.keys(cmap.standard[suit]||{})) { std++; must(exists(cmap.standard[suit][rank]), `missing card ${suit} ${rank}`); const [w,h]=pngDim(cmap.standard[suit][rank]); must(w>80 && h>120, `bad card size ${suit} ${rank}`); }
for (const k of Object.keys(cmap.special||{})) { sp++; must(exists(cmap.special[k]), `missing special ${k}`); }
for (const k of Object.keys(cmap.backs||{})) { back++; must(exists(cmap.backs[k]), `missing back ${k}`); }
must(std===lock.must.standard_cards, `standard card count ${std}`);
must(sp===lock.must.special_cards, `special card count ${sp}`);
must(back===lock.must.backs, `back count ${back}`);
if (!noHash) for (const [p,h] of Object.entries(lock.sha256||{})) must(sha(p)===h, `${p} sha mismatch`);
if (snapPath) {
  const s = readJson(snapPath);
  must(s.design?.w===lock.design.w && s.design?.h===lock.design.h, "runtime design size wrong");
  must((s.table?.src||"").endsWith(lock.paths.table), "runtime table src wrong");
  must(s.table?.naturalW===1536 && s.table?.naturalH===1024, "runtime table natural size wrong");
  must(!s.table?.uses3d && !s.table?.usesCanvas && !s.table?.usesCssTable, "runtime is using forbidden table renderer");
  must((s.passOverlay?.src||"").endsWith(lock.paths.prod_overlay), "runtime passing overlay src wrong");
  must(Array.isArray(s.passAnchors) && s.passAnchors.length===12, "runtime anchor count wrong");
  const rById = Object.fromEntries(s.passAnchors.map(a=>[a.id,a]));
  for (const [id,dir] of Object.entries(lock.direction)) {
    const a = rById[id]; must(a, `runtime missing ${id}`);
    must(a.arrow_direction===dir, `runtime ${id} direction wrong`);
    must(a.slot_orientation===lock.orientation[id], `runtime ${id} orientation wrong`);
    must(a.slot_rotation_deg===lock.rotation[id], `runtime ${id} rotation wrong`);
  }
  must(s.cards?.usesImages === true, "runtime cards must be image assets");
  must(s.cards?.usesPlaceholders !== true, "runtime cards are placeholders");
  must(s.flow?.firstDeal === 8, "runtime first deal must be 8");
  must(s.flow?.secondDeal === 6, "runtime second deal must be 6");
  must(s.flow?.passCount === 3, "runtime pass count must be 3");
}
ok("tichu_v6 assets and lock validated");
