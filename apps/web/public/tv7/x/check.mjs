#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function fail(msg){ console.error('FAIL:', msg); process.exit(1); }
function ok(cond,msg){ if(!cond) fail(msg); }
function file(root,rel){ return path.join(root, rel); }

const args=process.argv.slice(2);
const root=args[0] || '.';
const snapIdx=args.indexOf('--snap');
const snapPath=snapIdx>=0 ? args[snapIdx+1] : null;

for (const rel of ['t/plate.png','t/ref.png','p/a.json','p/o.png','h/a.json','h/s.png','h/d.png','c/map.json','lock.json']) {
  ok(fs.existsSync(file(root,rel)), `missing ${rel}`);
}

const lock=readJson(file(root,'lock.json'));
const pass=readJson(file(root,'p/a.json'));
const card=readJson(file(root,'h/a.json'));

ok(pass.design_px.w===1536 && pass.design_px.h===1024, 'passing design must be 1536x1024');
ok(card.design_px.w===1536 && card.design_px.h===1024, 'card design must be 1536x1024');
ok(Array.isArray(pass.anchors) && pass.anchors.length===12, 'passing anchors must be exactly 12');
ok(Array.isArray(card.anchors) && card.anchors.length===58, 'card anchors must be exactly 58');

const passMap=new Map(pass.anchors.map(a=>[a.id,a]));
for (const [id, exp] of Object.entries(lock.passing)) {
  const a=passMap.get(id);
  ok(a, `missing pass ${id}`);
  ok(a.arrow_direction===exp.dir, `${id} dir ${a.arrow_direction} != ${exp.dir}`);
  ok(a.slot_orientation===exp.orientation || a.orientation===exp.orientation, `${id} orientation mismatch`);
  ok((a.slot_rotation_deg ?? a.rotation_deg)===exp.rotation, `${id} rotation mismatch`);
}

const zones={};
for (const a of card.anchors) zones[a.zone]=(zones[a.zone]||0)+1;
for (const [z,n] of Object.entries(lock.cards.zones)) ok(zones[z]===n, `card zone ${z} count ${zones[z]} != ${n}`);
for (const a of card.anchors) {
  ok(a.layout_source==='prototype_layer', `${a.id} layout_source must be prototype_layer`);
  ok(a.bbox_px && a.center_px && a.polygon_px, `${a.id} missing geometry`);
  ok(fs.existsSync(file(root,a.mask)), `missing mask ${a.mask}`);
  ok(fs.existsSync(file(root,a.slot_img)), `missing slot image ${a.slot_img}`);
}

// card map/images
const cmap=readJson(file(root,'c/map.json'));
let imgCount=0;
function walk(v){ if(Array.isArray(v)) v.forEach(walk); else if(v && typeof v==='object') Object.values(v).forEach(walk); else if(typeof v==='string' && v.endsWith('.png')) { imgCount++; ok(fs.existsSync(file(root, v)), `card map missing ${v}`); } }
walk(cmap);
ok(imgCount>=58, `expected at least 58 png paths in card map, got ${imgCount}`);

if (snapPath) {
  const snap=readJson(snapPath);
  ok((snap.assetRoot||'').endsWith('/tv7'), 'snapshot assetRoot must end with /tv7');
  ok((snap.table?.src||snap.tablePlate||'').endsWith('/tv7/t/plate.png'), 'snapshot table must use /tv7/t/plate.png');
  ok((snap.passing?.overlaySrc||snap.passingOverlay||'').endsWith('/tv7/p/o.png'), 'snapshot passing overlay must use /tv7/p/o.png');
  const sa=snap.passing?.anchors || snap.anchors || [];
  ok(sa.length===12, 'snapshot must expose 12 pass anchors');
  const sc=snap.cards || {};
  ok(sc.layoutSource==='prototype_layer' || sc.layoutSource==='prototype', 'snapshot card layout source must be prototype_layer/prototype');
  ok(sc.usingImageAssets===true, 'snapshot cards must use images');
  ok(sc.placeholders===false, 'snapshot placeholders must be false');
}

console.log('OK tichu_v7');
