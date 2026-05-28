#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || '.';
function readJson(p){ return JSON.parse(fs.readFileSync(path.join(root,p),'utf8')); }
function exists(p){ if(!fs.existsSync(path.join(root,p))) throw new Error(`missing ${p}`); }
function close(a,b,t=0.01){ return Math.abs(a-b)<=t; }
for (const p of ['t/base.png','t/dragon.png','t/plate.png','h/a.json','h/math.json','h/rack.json','p/a.json','p/o.png','p/s.png','p/r.png','k/a.json','c/map.json']) exists(p);
const h=readJson('h/a.json');
const hm=readJson('h/math.json');
const racks=readJson('h/rack.json');
const p=readJson('p/a.json');
const k=readJson('k/a.json');
if(h.anchors.length!==56) throw new Error(`hand anchors ${h.anchors.length} != 56`);
if(hm.anchors.length!==56) throw new Error(`hand math lock ${hm.anchors.length} != 56`);
for (const seat of ['north','east','south','west']) {
  const n=h.anchors.filter(a=>a.seat===seat).length;
  if(n!==14) throw new Error(`${seat} hand count ${n} != 14`);
}
if(racks.racks.length!==4) throw new Error('rack count must be 4');
for (const a of h.anchors) {
  if(!a.center_px || !a.w_px || !a.h_px) throw new Error(`bad hand anchor ${a.id}`);
  if(!String(a.layout_source).includes('layer')) throw new Error(`bad layout_source ${a.id}`);
  if(['north','east','west'].includes(a.seat) && a.contained_by_rack!==true) throw new Error(`opponent card not rack-contained ${a.id}`);
}
const sideCardRot = { west: -13, east: 13 };
for (const seat of ['west','east']) {
  const rots = new Set(h.anchors.filter(a=>a.seat===seat).map(a=>Number(a.rotation_deg)));
  if(!rots.has(sideCardRot[seat])) throw new Error(`${seat} card anchors not angled along rail`);
}
if(p.anchors.length!==12) throw new Error(`passing anchors ${p.anchors.length} != 12`);
const expected={
 north_pass_left:['left','landscape',0], north_pass_across:['south','portrait',0], north_pass_right:['right','landscape',0],
 south_pass_left:['left','landscape',0], south_pass_across:['north','portrait',0], south_pass_right:['right','landscape',0],
 east_pass_north:['north','portrait',-90], east_pass_across:['west','landscape',90], east_pass_south:['south','portrait',90],
 west_pass_north:['north','portrait',-90], west_pass_across:['east','landscape',90], west_pass_south:['south','portrait',90]
};
for(const [id,[dir,ori,rot]] of Object.entries(expected)){
  const a=p.anchors.find(x=>x.id===id);
  if(!a) throw new Error(`missing ${id}`);
  if(a.arrow_direction!==dir) throw new Error(`${id} dir ${a.arrow_direction} != ${dir}`);
  if(a.orientation!==ori) throw new Error(`${id} orientation ${a.orientation} != ${ori}`);
  if(Number(a.card_rotation_deg)!==rot) throw new Error(`${id} card rot ${a.card_rotation_deg} != ${rot}`);
  if(!Array.isArray(a.polygon_px) || a.polygon_px.length!==4) throw new Error(`${id} missing polygon`);
}
function anchor(id){return p.anchors.find(a=>a.id===id)}
function edgeProjection(a, edge){
  const rot = Number(a.shape_rotation_deg || a.visual_rotation_deg || 0) * Math.PI/180;
  const ux = [Math.cos(rot), Math.sin(rot)];
  const cx=a.center_px.x, cy=a.center_px.y;
  if(edge==='left') return cx - (a.w_px/2)*ux[0];
  if(edge==='right') return cx + (a.w_px/2)*ux[0];
  if(edge==='top') return a.bbox_px.y;
  if(edge==='bottom') return a.bbox_px.y + a.bbox_px.h;
}
const westX=[anchor('west_pass_north'),anchor('west_pass_across'),anchor('west_pass_south')].map(a=>edgeProjection(a,'left'));
if(Math.max(...westX)-Math.min(...westX)>0.5) throw new Error('west angled keyed left edge mismatch');
const eastX=[anchor('east_pass_north'),anchor('east_pass_across'),anchor('east_pass_south')].map(a=>edgeProjection(a,'right'));
if(Math.max(...eastX)-Math.min(...eastX)>0.5) throw new Error('east angled keyed right edge mismatch');
for (const id of ['west_pass_north','west_pass_across','west_pass_south']) {
  const a=anchor(id); if(Number(a.shape_rotation_deg)!==-13) throw new Error(`${id} must have -13 shape rotation`);
  if(a.side_target_geometry!=='angled_polygon') throw new Error(`${id} must be angled polygon`);
}
for (const id of ['east_pass_north','east_pass_across','east_pass_south']) {
  const a=anchor(id); if(Number(a.shape_rotation_deg)!==13) throw new Error(`${id} must have +13 shape rotation`);
  if(a.side_target_geometry!=='angled_polygon') throw new Error(`${id} must be angled polygon`);
}
// Side spacing rhythm: check keyed edge center y, not visual center y, because widths differ.
function keyedEdgeCenterY(a, edge){
  const rot = Number(a.shape_rotation_deg || a.visual_rotation_deg || 0) * Math.PI/180;
  const ux = [Math.cos(rot), Math.sin(rot)];
  if(edge==='left') return a.center_px.y - (a.w_px/2)*ux[1];
  if(edge==='right') return a.center_px.y + (a.w_px/2)*ux[1];
  return a.center_px.y;
}
for (const side of ['west','east']) {
  const edge = side === 'west' ? 'left' : 'right';
  const y1=keyedEdgeCenterY(anchor(`${side}_pass_north`), edge);
  const y2=keyedEdgeCenterY(anchor(`${side}_pass_across`), edge);
  const y3=keyedEdgeCenterY(anchor(`${side}_pass_south`), edge);
  if(Math.abs((y2-y1)-(y3-y2))>1.0) throw new Error(`${side} side passing spacing not balanced`);
}
if(k.anchors.length!==5) throw new Error(`trick anchors ${k.anchors.length} != 5`);
for (const a of k.anchors) if(a.virtual_only!==true || a.production_overlay!==false) throw new Error(`trick anchor must be virtual only ${a.id}`);
console.log('OK tichu_v15');
