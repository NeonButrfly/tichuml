import anchorsJson from "../assets/tichu_v6/p/a.json";
const anchors = (anchorsJson as any).anchors;
const byId = (id: string) => anchors.find((a: any) => a.id === id);
const expectedDirections = {
  north_pass_left: "left",
  north_pass_across: "south",
  north_pass_right: "right",
  south_pass_left: "left",
  south_pass_across: "north",
  south_pass_right: "right",
  east_pass_north: "north",
  east_pass_across: "west",
  east_pass_south: "south",
  west_pass_north: "north",
  west_pass_across: "east",
  west_pass_south: "south",
} as const;
describe("tichu v6 passing anchors", () => {
  it("has exactly 12 anchors", () => expect(anchors).toHaveLength(12));
  it("locks directions", () => {
    for (const [id, direction] of Object.entries(expectedDirections)) {
      expect(byId(id).arrow_direction).toBe(direction);
      expect(byId(id).points_to).toBe(direction);
    }
  });
  it("fixes east/west lane orientation and rotation", () => {
    expect(byId("east_pass_north").slot_orientation).toBe("portrait");
    expect(byId("east_pass_north").slot_rotation_deg).toBe(-90);
    expect(byId("east_pass_across").slot_orientation).toBe("landscape");
    expect(byId("east_pass_across").slot_rotation_deg).toBe(90);
    expect(byId("east_pass_south").slot_orientation).toBe("portrait");
    expect(byId("east_pass_south").slot_rotation_deg).toBe(90);
    expect(byId("west_pass_north").slot_orientation).toBe("portrait");
    expect(byId("west_pass_north").slot_rotation_deg).toBe(-90);
    expect(byId("west_pass_across").slot_orientation).toBe("landscape");
    expect(byId("west_pass_across").slot_rotation_deg).toBe(90);
    expect(byId("west_pass_south").slot_orientation).toBe("portrait");
    expect(byId("west_pass_south").slot_rotation_deg).toBe(90);
  });
});
