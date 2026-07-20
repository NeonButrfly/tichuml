import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const pass = JSON.parse(fs.readFileSync('apps/web/public/tv7/p/a.json','utf8'));
const card = JSON.parse(fs.readFileSync('apps/web/public/tv7/h/a.json','utf8'));

describe('tv7 locked layers', () => {
  it('keeps passing lanes exactly locked', () => {
    const expected = {
      north_pass_left: ['left','landscape',0], north_pass_across: ['south','portrait',0], north_pass_right: ['right','landscape',0],
      south_pass_left: ['left','landscape',0], south_pass_across: ['north','portrait',0], south_pass_right: ['right','landscape',0],
      east_pass_north: ['north','portrait',-90], east_pass_across: ['west','landscape',90], east_pass_south: ['south','portrait',90],
      west_pass_north: ['north','portrait',-90], west_pass_across: ['east','landscape',90], west_pass_south: ['south','portrait',90],
    } as const;
    expect(pass.anchors).toHaveLength(12);
    for (const [id, [dir, orient, rot]] of Object.entries(expected)) {
      const a = pass.anchors.find((x: any) => x.id === id);
      expect(a).toBeTruthy();
      expect(a.arrow_direction).toBe(dir);
      expect(a.slot_orientation).toBe(orient);
      expect(a.slot_rotation_deg).toBe(rot);
    }
  });

  it('uses card layout anchors as prototype layer', () => {
    expect(card.anchors).toHaveLength(58);
    const zones = Object.groupBy(card.anchors, (a: any) => a.zone);
    expect(zones.south_hand).toHaveLength(14);
    expect(zones.north_hand).toHaveLength(14);
    expect(zones.east_hand).toHaveLength(14);
    expect(zones.west_hand).toHaveLength(14);
    expect(zones.deck).toHaveLength(1);
    expect(zones.discard).toHaveLength(1);
    for (const a of card.anchors) expect(a.layout_source).toBe('prototype_layer');
  });
});
