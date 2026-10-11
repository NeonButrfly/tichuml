/*
    Basic Gridfinity Generator (BGG) V1.2.6

    A focused OpenSCAD generator for clean Gridfinity-compatible base grids.

    Workflow
    1. Choose output mode.
    2. Choose grid style.
    3. Add optional features such as magnets or Strong-style screw holes.
    4. Set the total grid size in cells or millimeters.
    5. Select a printer plate size for printable split output.

    Grid styles
    - Standard
      Solid Gridfinity base plate with open underside pockets.
      Optional magnet pockets can be added from the bottom.

    - Strong
      Standard grid with bottom stiffeners.
      Optional magnets and chamfered screw holes can be added.
      The lower stiffener zone is at least 2.5 mm high and raises if needed.

    - Light
      Hollowed grid using the same Gridfinity reference contour.
      Keeps the functional geometry while reducing material and print time.

    - Ultra light
      Experimental lightweight ribbed version with reference zones,
      low ribs, Y-connectors, and small internal diagonal braces.
*/


// =====================================================
// 00 - OUTPUT
// =====================================================

/* [00 - Output] */

output_mode = "Full grid"; // [Full grid, Printable split, Magnet fit test, Developer]


// =====================================================
// 01 - GRID STYLE
// =====================================================

/* [01 - Grid Style] */

grid_style = "Standard"; // [Standard, Strong, Light, Ultra light]


// =====================================================
// 02 - ADDITIONS
// =====================================================

/* [02 - Additions] */

add_magnet_pockets = "No"; // [No, Yes]

magnet_diameter = 6;
magnet_height = 2; // [0.1:0.1:10]

// Extra diameter clearance for easier magnet fitting.
magnet_diameter_clearance = 0.3;

// Magnet center position measured from the inside edge of the bottom Gridfinity pocket.
// 4.5 mm is close to the common 8 mm-from-cell-edge magnet layout.
magnet_distance_from_pocket_edge = 4.5;

// Strong grid only: add one chamfered screw hole in the center of each stiffener cross.
add_strong_screw_holes = "Yes"; // [No, Yes]

screw_hole_diameter = 3.2;
screw_chamfer_depth = 1.0;


// =====================================================
// 03 - TOTAL GRID SIZE
// =====================================================

/* [03 - Total Grid Size] */

grid_size_input = "Grid cells"; // [Grid cells, Millimeters]

grid_cells_x = 6; // [1:100]
grid_cells_y = 6; // [1:100]

target_grid_width_mm = 300;
target_grid_depth_mm = 420;

millimeter_conversion_rule = "Fit inside size"; // [Fit inside size, At least this size, Nearest full cells]


// =====================================================
// 04 - PRINTER / SPLIT SIZE
// =====================================================

/* [04 - Printer / Split Size] */

printer_size = "Bambu P1S / X1C / A1"; // [Bambu P1S / X1C / A1, Bambu H2D, Bambu A1 mini, Prusa MK3/MK4, Creality K1, Creality K1 Max, Voron 2.4 300, Voron 2.4 350, Custom plate]

custom_plate_width = 220;
custom_plate_depth = 220;


// =====================================================
// 99 - HIDDEN / DEVELOPMENT SETTINGS
// =====================================================

/* [Hidden] */

script_version = "V1.2.6";

// Fixed preview/render resolution for better compatibility with online customizers.
$fn = 48;


// ---------- Hidden magnet tuning ----------

magnet_height_clearance = 0.0;
magnet_bottom_skin = 0.2;
magnet_support_wall = 2;
magnet_blend_to_grid = "Yes";
magnet_blend_width = 12;
magnet_blend_length = 7;
magnet_pocket_top_overlap = 0.3;


// ---------- Hidden Strong grid tuning ----------

strong_lower_min_height = 2.5;
strong_brace_width = 3.0;
strong_screw_min_bottom_skin = 1.0;


// ---------- Printer presets ----------

plate_bambu_p1s_x1c_a1_x = 235;
plate_bambu_p1s_x1c_a1_y = 250;

plate_bambu_h2d_x = 325;
plate_bambu_h2d_y = 320;

plate_bambu_a1_mini_x = 180;
plate_bambu_a1_mini_y = 180;

plate_prusa_mk3_mk4_x = 250;
plate_prusa_mk3_mk4_y = 210;

plate_creality_k1_x = 220;
plate_creality_k1_y = 220;

plate_creality_k1_max_x = 300;
plate_creality_k1_max_y = 300;

plate_voron_2_4_300_x = 300;
plate_voron_2_4_300_y = 300;

plate_voron_2_4_350_x = 350;
plate_voron_2_4_350_y = 350;


// ---------- Gridfinity reference geometry ----------

gridfinity_pitch = 42;

base_height = 5.0;
gridfinity_profile_height = 4.75;

lower_chamfer_height = 0.80;
middle_straight_height = 1.80;
upper_chamfer_height = 2.15;

foot_bottom_size = 35.6;
foot_middle_size = 37.2;
foot_top_size = 41.5;

socket_clearance = 0.15;
inside_corner_radius = 1.6;
outer_corner_radius = 1.2;


// ---------- Print tuning ----------

nozzle_size = 0.4;
boolean_overlap = 0.03;

plate_edge_margin = 1;
split_layout_gap = 20;

bottom_opening_margin = 0.8;


// ---------- Light grid tuning ----------

light_wall_width = 0.9;
light_top_cut = 0.5;
light_top_flat_thickness = 0.5;


// ---------- Ultra light grid tuning ----------

ultra_top_cut = 0.6;
ultra_wall_width = 0.9;

ultra_corner_reference_size = 10;
ultra_corner_slope_top_size = 13.0;
ultra_outer_rim_ramp_length = 2.0;

ultra_internal_brace_width = 0.9;
ultra_internal_brace_height = 0.5;

ultra_rib_height_ratio = 0.40;
ultra_y_connector_length = 5.2;
ultra_y_connector_spread = 1.8;
ultra_mid_rib_end_clearance = 5;
ultra_y_stem_overlap = 1.6;
ultra_y_stem_length = 2.0;


// =====================================================
// DERIVED VALUES
// =====================================================

active_plate_width = selected_plate_width();
active_plate_depth = selected_plate_depth();

printable_width = max(1, active_plate_width - 2 * plate_edge_margin);
printable_depth = max(1, active_plate_depth - 2 * plate_edge_margin);

cells_x = max(1, calculated_cell_count_x());
cells_y = max(1, calculated_cell_count_y());

grid_width = cells_x * gridfinity_pitch;
grid_depth = cells_y * gridfinity_pitch;

split_cells_x = max(1, floor(printable_width / gridfinity_pitch));
split_cells_y = max(1, floor(printable_depth / gridfinity_pitch));

split_count_x = ceil(cells_x / split_cells_x);
split_count_y = ceil(cells_y / split_cells_y);

layout_step_x = active_plate_width + split_layout_gap;
layout_step_y = active_plate_depth + split_layout_gap;


// =====================================================
// DEVELOPER INFO AND SAFETY CHECKS
// =====================================================

if (output_mode == "Developer") {
    echo(str("--- Basic Gridfinity Generator ", script_version, " ---"));
    echo("Output mode", output_mode);
    echo("Grid style", grid_style);
    echo("Active height", active_grid_height());
    echo("Grid cells", cells_x, "x", cells_y);
    echo("Grid size", grid_width, "x", grid_depth);
    echo("Printer / plate", printer_size, active_plate_width, "x", active_plate_depth);
    echo("Printable cells per split", split_cells_x, "x", split_cells_y);
    echo("Split count", split_count_x, "x", split_count_y);
    echo("Magnets", add_magnet_pockets);
    echo("Magnet pocket diameter", magnet_pocket_diameter());
    echo("Magnet pocket depth", magnet_pocket_depth());
    echo("Magnet lower height", magnet_lower_height());
    echo("Strong lower height", strong_lower_module_height());
    echo("Strong screw holes", add_strong_screw_holes);
    echo("Screw hole diameter", screw_hole_diameter);
    echo("Screw chamfer depth", screw_chamfer_depth);
    echo("Screw chamfer diameter", screw_chamfer_diameter());
    echo("Screw support diameter", screw_support_diameter());
    echo("Light grid height", light_grid_height());
    echo("Ultra light height", ultra_light_grid_height());
}

assert(gridfinity_pitch == 42, "Gridfinity pitch must stay 42 mm.");
assert(abs(gridfinity_profile_height - (lower_chamfer_height + middle_straight_height + upper_chamfer_height)) < 0.001, "Gridfinity profile heights do not add up correctly.");
assert(printable_width >= gridfinity_pitch && printable_depth >= gridfinity_pitch, "Printable area is smaller than one Gridfinity cell. Increase the plate size.");
assert(inside_corner_radius > 0, "Inside corner radius must be larger than 0.");
assert(nozzle_size > 0, "Nozzle size must be larger than 0.");

assert(magnet_diameter > 0, "Magnet diameter must be larger than 0.");
assert(magnet_height > 0, "Magnet height must be larger than 0.");
assert(magnet_diameter_clearance >= 0, "Magnet diameter clearance must be 0 or larger.");
assert(magnet_height_clearance >= 0, "Magnet height clearance must be 0 or larger.");
assert(magnet_distance_from_pocket_edge > 0 && magnet_distance_from_pocket_edge < bottom_opening_size() / 2, "Magnet pocket-edge distance must be larger than 0 and smaller than half the bottom pocket size.");
assert(magnet_support_wall >= 0, "Magnet support wall must be 0 or larger.");
assert(magnet_blend_width > 0, "Magnet blend width must be larger than 0.");
assert(magnet_blend_length >= 0, "Magnet blend length must be 0 or larger.");
assert(magnet_pocket_top_overlap >= 0, "Magnet pocket top overlap must be 0 or larger.");
assert(add_magnet_pockets == "No" || magnet_center_offset() + magnet_support_diameter() / 2 < gridfinity_pitch / 2, "Magnet supports do not fit inside one Gridfinity cell. Reduce magnet size/support wall or increase the pocket-edge distance.");

assert(strong_lower_min_height > 0, "Strong lower minimum height must be larger than 0.");
assert(effective_strong_brace_width() >= minimum_feature_width(), "Strong brace width is below the minimum printable feature width.");
assert(screw_hole_diameter > 0, "Screw hole diameter must be larger than 0.");
assert(screw_chamfer_depth >= 0, "Screw chamfer depth must be 0 or larger.");
assert(strong_screw_min_bottom_skin >= 0, "Strong screw minimum bottom skin must be 0 or larger.");
assert(add_strong_screw_holes == "No" || screw_support_diameter() < bottom_opening_size(), "Screw support circle does not fit in the bottom pocket opening. Reduce screw diameter or chamfer depth.");

assert(light_wall_width >= minimum_wall_width(), "Light wall should be at least two nozzle widths.");
assert(light_top_flat_thickness >= 0, "Light top flat thickness must be 0 or larger.");

assert(ultra_top_cut >= 0, "Ultra top cut must be 0 or larger.");
assert(ultra_wall_width >= minimum_wall_width(), "Ultra wall should be at least two nozzle widths.");
assert(ultra_corner_reference_size > 0 && ultra_corner_reference_size < gridfinity_pitch / 2, "Ultra corner reference size must be between 0 and half a cell.");
assert(ultra_corner_slope_top_size >= 8 && ultra_corner_slope_top_size < 2 * ultra_corner_reference_size, "Ultra corner slope top size must be at least 8 mm and smaller than the full reference block.");
assert(ultra_outer_rim_ramp_length > 0 && ultra_outer_rim_ramp_length < gridfinity_pitch / 2, "Ultra outer rim ramp length must be larger than 0 and smaller than half a Gridfinity cell.");
assert(ultra_internal_brace_width >= minimum_feature_width(), "Ultra internal brace width is below the minimum printable feature width.");
assert(ultra_internal_brace_height > 0 && ultra_internal_brace_height <= ultra_rib_height(), "Ultra internal brace height must be larger than 0 and not higher than the Ultra rib height.");
assert(ultra_internal_corner_span() > 0, "Ultra internal brace span must be larger than 0.");
assert(ultra_y_connector_length > 0 && ultra_y_connector_length < ultra_corner_reference_size, "Ultra Y connector length must be larger than 0 and smaller than the reference size.");
assert(ultra_y_connector_spread > 0 && ultra_y_connector_spread < ultra_corner_reference_size, "Ultra Y connector spread must be larger than 0 and smaller than the reference size.");
assert(ultra_mid_rib_end_clearance >= 0 && ultra_mid_rib_end_clearance < (gridfinity_pitch - 2 * ultra_corner_reference_size) / 2, "Ultra mid rib end clearance must fit inside the remaining mid rib length.");
assert(ultra_y_stem_overlap >= 0 && ultra_y_stem_overlap <= ultra_mid_rib_end_clearance, "Ultra Y stem overlap must be 0 or larger and not larger than the mid rib end clearance.");
assert(ultra_y_stem_length > 0 && ultra_y_stem_length < ultra_y_connector_length, "Ultra Y stem length must be larger than 0 and smaller than the full Y connector length.");
assert(ultra_rib_height_ratio > 0 && ultra_rib_height_ratio <= 1, "Ultra rib height ratio must be between 0 and 1.");


// =====================================================
// VIEW ROUTER
// =====================================================

if (output_mode == "Full grid") {
    make_grid(cells_x, cells_y);
}
else if (output_mode == "Printable split") {
    printable_split_layout();
}
else if (output_mode == "Magnet fit test") {
    magnet_fit_test_layout();
}
else if (output_mode == "Developer") {
    developer_type_comparison();
}


// =====================================================
// MAGNET FIT TEST
// =====================================================

module magnet_fit_test_layout() {
    test_clearances = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5];
    test_labels = ["+0.0", "+0.1", "+0.2", "+0.3", "+0.4", "+0.5"];

    test_body_diameter = magnet_diameter + 12;
    test_body_height = magnet_height + magnet_bottom_skin;

    // Overlap the circles enough to make the fit test one solid printable part.
    test_circle_overlap = 2.0;
    test_spacing = test_body_diameter - test_circle_overlap;

    for (i = [0 : len(test_clearances) - 1]) {
        translate([i * test_spacing, 0, 0]) {
            magnet_fit_test_piece(
                test_body_diameter,
                test_body_height,
                magnet_diameter + test_clearances[i],
                magnet_height + magnet_height_clearance,
                test_labels[i]
            );
        }
    }
}

module magnet_fit_test_piece(body_diameter, body_height, pocket_diameter, pocket_depth, label_text) {
    eps = boolean_overlap;
    label_height = 0.25;
    label_size = min(3.2, body_diameter / 5);
    pocket_bottom_z = body_height - pocket_depth;

    union() {
        difference() {
            cylinder(h = body_height, d = body_diameter);

            translate([0, 0, pocket_bottom_z - eps]) {
                cylinder(
                    h = pocket_depth + magnet_pocket_top_overlap + 2 * eps,
                    d = pocket_diameter
                );
            }
        }

        // Raised label showing the added pocket diameter clearance.
        translate([0, -body_diameter * 0.32, body_height]) {
            linear_extrude(height = label_height) {
                text(
                    label_text,
                    size = label_size,
                    halign = "center",
                    valign = "center"
                );
            }
        }
    }
}


// =====================================================
// SIZE AND PRESET FUNCTIONS
// =====================================================

function calculated_cell_count_x() =
    grid_size_input == "Grid cells" ? grid_cells_x :
    millimeter_conversion_rule == "At least this size" ? ceil(target_grid_width_mm / gridfinity_pitch) :
    millimeter_conversion_rule == "Nearest full cells" ? floor((target_grid_width_mm / gridfinity_pitch) + 0.5) :
    floor(target_grid_width_mm / gridfinity_pitch);

function calculated_cell_count_y() =
    grid_size_input == "Grid cells" ? grid_cells_y :
    millimeter_conversion_rule == "At least this size" ? ceil(target_grid_depth_mm / gridfinity_pitch) :
    millimeter_conversion_rule == "Nearest full cells" ? floor((target_grid_depth_mm / gridfinity_pitch) + 0.5) :
    floor(target_grid_depth_mm / gridfinity_pitch);

function selected_plate_width() =
    printer_size == "Bambu P1S / X1C / A1" ? plate_bambu_p1s_x1c_a1_x :
    printer_size == "Bambu H2D" ? plate_bambu_h2d_x :
    printer_size == "Bambu A1 mini" ? plate_bambu_a1_mini_x :
    printer_size == "Prusa MK3/MK4" ? plate_prusa_mk3_mk4_x :
    printer_size == "Creality K1" ? plate_creality_k1_x :
    printer_size == "Creality K1 Max" ? plate_creality_k1_max_x :
    printer_size == "Voron 2.4 300" ? plate_voron_2_4_300_x :
    printer_size == "Voron 2.4 350" ? plate_voron_2_4_350_x :
    custom_plate_width;

function selected_plate_depth() =
    printer_size == "Bambu P1S / X1C / A1" ? plate_bambu_p1s_x1c_a1_y :
    printer_size == "Bambu H2D" ? plate_bambu_h2d_y :
    printer_size == "Bambu A1 mini" ? plate_bambu_a1_mini_y :
    printer_size == "Prusa MK3/MK4" ? plate_prusa_mk3_mk4_y :
    printer_size == "Creality K1" ? plate_creality_k1_y :
    printer_size == "Creality K1 Max" ? plate_creality_k1_max_y :
    printer_size == "Voron 2.4 300" ? plate_voron_2_4_300_y :
    printer_size == "Voron 2.4 350" ? plate_voron_2_4_350_y :
    custom_plate_depth;

function split_start_cell_x(index_x) = index_x * split_cells_x;
function split_start_cell_y(index_y) = index_y * split_cells_y;

function split_cell_count_x(index_x) =
    min(split_cells_x, cells_x - split_start_cell_x(index_x));

function split_cell_count_y(index_y) =
    min(split_cells_y, cells_y - split_start_cell_y(index_y));


// =====================================================
// HEIGHT, POCKET, AND PROFILE FUNCTIONS
// =====================================================

function minimum_wall_width() = nozzle_size * 2;
function minimum_feature_width() = nozzle_size * 1.25;

function magnets_enabled() = add_magnet_pockets == "Yes";
function strong_screws_enabled() = add_strong_screw_holes == "Yes";

function magnet_pocket_diameter() = magnet_diameter + magnet_diameter_clearance;
function magnet_pocket_depth() = magnet_height + magnet_height_clearance;
function magnet_center_offset() = bottom_opening_size() / 2 - magnet_distance_from_pocket_edge;
function magnet_support_diameter() = magnet_pocket_diameter() + 2 * magnet_support_wall;
function magnet_lower_height() = magnets_enabled() ? magnet_pocket_depth() + magnet_bottom_skin : 0;

function screw_chamfer_diameter() =
    screw_hole_diameter + 2 * screw_chamfer_depth;

function screw_support_diameter() =
    screw_chamfer_diameter() + 2;

function strong_screw_required_lower_height() =
    strong_screws_enabled() ? screw_chamfer_depth + strong_screw_min_bottom_skin : 0;

function strong_lower_module_height() =
    max(strong_lower_min_height, magnet_lower_height(), strong_screw_required_lower_height());

function standard_grid_height() =
    base_height + magnet_lower_height();

function strong_grid_height() =
    base_height + strong_lower_module_height();

function light_grid_height() =
    max(1, base_height - light_top_cut);

function ultra_light_grid_height() =
    max(1, light_grid_height() - ultra_top_cut);

function active_grid_height() =
    grid_style == "Standard" ? standard_grid_height() :
    grid_style == "Strong" ? strong_grid_height() :
    grid_style == "Ultra light" ? ultra_light_grid_height() :
    light_grid_height();

function standard_socket_z() =
    base_height - gridfinity_profile_height;

function strong_socket_z() =
    standard_socket_z();

function light_socket_z() =
    standard_socket_z();

function effective_strong_brace_width() =
    max(strong_brace_width, minimum_feature_width());

function bottom_opening_size() =
    profile_size_at_z(0) - 2 * bottom_opening_margin;

function bottom_opening_radius() =
    max(0.4, profile_radius_at_z(0) - bottom_opening_margin);

function ultra_rib_height() =
    max(0.2, light_grid_height() * ultra_rib_height_ratio);

function ultra_mid_section_height() =
    light_socket_z() + lower_chamfer_height + middle_straight_height;

function ultra_corner_slope_start_height(height) =
    min(height - 0.05, ultra_mid_section_height());

function ultra_rib_end_height(height) =
    min(height, ultra_mid_section_height());

function ultra_connector_spread() =
    min(ultra_y_connector_spread, ultra_y_connector_length);

function ultra_reference_radius(size) =
    max(0.01, min(inside_corner_radius, size / 2 - 0.01));

function ultra_internal_corner_span() =
    max(
        0.01,
        gridfinity_pitch - (profile_size_at_z(lower_chamfer_height) + 0.05) + 1
    );


// =====================================================
// GRIDFINITY SOCKET PROFILE
// =====================================================

function profile_size_at_z(z) =
    z <= 0 ? foot_bottom_size + 2 * socket_clearance :
    z < lower_chamfer_height ?
        foot_bottom_size + 2 * socket_clearance +
        ((foot_middle_size - foot_bottom_size) * (z / lower_chamfer_height)) :
    z < lower_chamfer_height + middle_straight_height ?
        foot_middle_size + 2 * socket_clearance :
    z < gridfinity_profile_height ?
        let(
            upper_z = z - lower_chamfer_height - middle_straight_height,
            blend = upper_z / upper_chamfer_height
        )
            foot_middle_size + 2 * socket_clearance +
            ((foot_top_size - foot_middle_size) * blend) :
    foot_top_size + 2 * socket_clearance;

function profile_radius_at_z(z) =
    min(inside_corner_radius + socket_clearance, profile_size_at_z(z) / 2 - 0.01);

function light_profile_z(abs_z) =
    max(lower_chamfer_height, abs_z - light_socket_z());

function light_inner_size(abs_z) =
    profile_size_at_z(light_profile_z(abs_z));

function light_inner_radius(abs_z) =
    profile_radius_at_z(light_profile_z(abs_z));

function light_outer_size(abs_z) =
    min(gridfinity_pitch + 2 * boolean_overlap, light_inner_size(abs_z) + 2 * light_wall_width);

function light_outer_radius(abs_z) =
    min(light_inner_radius(abs_z) + light_wall_width, light_outer_size(abs_z) / 2 - 0.01);


// =====================================================
// OUTPUT MODULES
// =====================================================

module printable_split_layout() {
    for (x_index = [0 : split_count_x - 1]) {
        for (y_index = [0 : split_count_y - 1]) {
            translate([x_index * layout_step_x, y_index * layout_step_y, 0]) {
                make_grid(split_cell_count_x(x_index), split_cell_count_y(y_index));
            }
        }
    }
}

module make_grid(cell_count_x, cell_count_y) {
    if (grid_style == "Standard") {
        standard_grid(cell_count_x, cell_count_y);
    }
    else if (grid_style == "Strong") {
        strong_grid(cell_count_x, cell_count_y);
    }
    else if (grid_style == "Light") {
        light_grid(cell_count_x, cell_count_y);
    }
    else {
        ultra_light_grid(cell_count_x, cell_count_y);
    }
}

module developer_type_comparison() {
    sample_cells = 2;
    sample_size = sample_cells * gridfinity_pitch;
    sample_gap = 10;
    sample_step = sample_size + sample_gap;

    translate([0, sample_step, 0]) {
        standard_grid(sample_cells, sample_cells);
    }

    translate([sample_step, sample_step, 0]) {
        strong_grid(sample_cells, sample_cells);
    }

    translate([0, 0, 0]) {
        light_grid(sample_cells, sample_cells);
    }

    translate([sample_step, 0, 0]) {
        ultra_light_grid(sample_cells, sample_cells);
    }
}


// =====================================================
// STANDARD GRID
// =====================================================

module standard_grid(cell_count_x, cell_count_y) {
    if (magnets_enabled()) {
        standard_grid_with_magnets(cell_count_x, cell_count_y);
    }
    else {
        standard_grid_plain(cell_count_x, cell_count_y);
    }
}

module standard_grid_plain(cell_count_x, cell_count_y) {
    width = cell_count_x * gridfinity_pitch;
    depth = cell_count_y * gridfinity_pitch;

    difference() {
        rounded_box(width, depth, base_height, outer_corner_radius);
        socket_grid_cutouts(cell_count_x, cell_count_y, standard_socket_z());
        open_bottom_cutouts(cell_count_x, cell_count_y, base_height);
    }
}

module standard_grid_with_magnets(cell_count_x, cell_count_y) {
    lower_height = magnet_lower_height();

    difference() {
        union() {
            translate([0, 0, lower_height]) {
                standard_grid_plain(cell_count_x, cell_count_y);
            }

            standard_under_grid_fill(cell_count_x, cell_count_y, lower_height);
            magnet_supports(cell_count_x, cell_count_y, lower_height);

            if (magnet_blend_to_grid == "Yes") {
                magnet_xy_blends(cell_count_x, cell_count_y, lower_height);
            }
        }

        magnet_cutouts(cell_count_x, cell_count_y, lower_height);
    }
}

module standard_under_grid_fill(cell_count_x, cell_count_y, fill_height) {
    eps = boolean_overlap;
    width = cell_count_x * gridfinity_pitch;
    depth = cell_count_y * gridfinity_pitch;

    difference() {
        translate([0, 0, -eps]) {
            rounded_box(width, depth, fill_height + 2 * eps, outer_corner_radius);
        }

        open_bottom_cutouts(cell_count_x, cell_count_y, fill_height + 2 * eps);
    }
}


// =====================================================
// MAGNET ADDITION MODULES
// =====================================================

module magnet_supports(cell_count_x, cell_count_y, support_height) {
    offset = magnet_center_offset();

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            cell_center_x = x * gridfinity_pitch + gridfinity_pitch / 2;
            cell_center_y = y * gridfinity_pitch + gridfinity_pitch / 2;

            for (magnet_x = [-offset, offset]) {
                for (magnet_y = [-offset, offset]) {
                    translate([
                        cell_center_x + magnet_x,
                        cell_center_y + magnet_y,
                        0
                    ]) {
                        magnet_support_pad(support_height);
                    }
                }
            }
        }
    }
}

module magnet_support_pad(support_height) {
    eps = boolean_overlap;

    translate([0, 0, -eps]) {
        cylinder(
            h = support_height + eps,
            d = magnet_support_diameter()
        );
    }
}

module magnet_xy_blends(cell_count_x, cell_count_y, blend_height) {
    offset = magnet_center_offset();

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            cell_center_x = x * gridfinity_pitch + gridfinity_pitch / 2;
            cell_center_y = y * gridfinity_pitch + gridfinity_pitch / 2;

            for (magnet_x = [-offset, offset]) {
                for (magnet_y = [-offset, offset]) {
                    translate([
                        cell_center_x + magnet_x,
                        cell_center_y + magnet_y,
                        0
                    ]) {
                        magnet_xy_blend_pad(
                            blend_height,
                            magnet_x < 0 ? -1 : 1,
                            magnet_y < 0 ? -1 : 1
                        );
                    }
                }
            }
        }
    }
}

module magnet_xy_blend_pad(blend_height, dir_x, dir_y) {
    eps = boolean_overlap;
    half_width = magnet_blend_width / 2;
    support_radius = magnet_support_diameter() / 2;

    union() {
        hull() {
            translate([0, 0, -eps]) {
                cylinder(h = blend_height + eps, d = magnet_support_diameter());
            }

            translate([dir_x * magnet_blend_length, 0, -eps]) {
                rounded_box_centered(
                    eps,
                    magnet_blend_width,
                    blend_height + eps,
                    half_width
                );
            }
        }

        hull() {
            translate([0, 0, -eps]) {
                cylinder(h = blend_height + eps, d = magnet_support_diameter());
            }

            translate([0, dir_y * magnet_blend_length, -eps]) {
                rounded_box_centered(
                    magnet_blend_width,
                    eps,
                    blend_height + eps,
                    half_width
                );
            }
        }

        hull() {
            translate([0, 0, -eps]) {
                cylinder(h = blend_height + eps, d = magnet_support_diameter());
            }

            translate([
                dir_x * max(0.01, magnet_blend_length - support_radius / 1),
                dir_y * max(0.01, magnet_blend_length - support_radius / 1),
                -eps
            ]) {
                cylinder(
                    h = blend_height + eps,
                    d = magnet_blend_width
                );
            }
        }
    }
}

module magnet_cutouts(cell_count_x, cell_count_y, support_height = magnet_lower_height()) {
    eps = boolean_overlap;
    offset = magnet_center_offset();
    pocket_bottom_z = support_height - magnet_pocket_depth();
    pocket_cut_height = magnet_pocket_depth() + magnet_pocket_top_overlap;

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            cell_center_x = x * gridfinity_pitch + gridfinity_pitch / 2;
            cell_center_y = y * gridfinity_pitch + gridfinity_pitch / 2;

            for (magnet_x = [-offset, offset]) {
                for (magnet_y = [-offset, offset]) {
                    translate([
                        cell_center_x + magnet_x,
                        cell_center_y + magnet_y,
                        pocket_bottom_z - eps
                    ]) {
                        cylinder(
                            h = pocket_cut_height + 2 * eps,
                            d = magnet_pocket_diameter()
                        );
                    }
                }
            }
        }
    }
}


// =====================================================
// STRONG GRID
// =====================================================

module strong_grid(cell_count_x, cell_count_y) {
    lower_height = strong_lower_module_height();

    difference() {
        union() {
            translate([0, 0, lower_height]) {
                strong_grid_body(cell_count_x, cell_count_y);
            }

            standard_under_grid_fill(cell_count_x, cell_count_y, lower_height);
            strong_bottom_braces(cell_count_x, cell_count_y, lower_height);

            if (magnets_enabled()) {
                magnet_supports(cell_count_x, cell_count_y, lower_height);

                if (magnet_blend_to_grid == "Yes") {
                    magnet_xy_blends(cell_count_x, cell_count_y, lower_height);
                }
            }

            if (strong_screws_enabled()) {
                screw_supports(cell_count_x, cell_count_y, lower_height);
            }
        }

        if (magnets_enabled()) {
            magnet_cutouts(cell_count_x, cell_count_y, lower_height);
        }

        if (strong_screws_enabled()) {
            screw_hole_cutouts(cell_count_x, cell_count_y, lower_height);
        }
    }
}

module strong_grid_body(cell_count_x, cell_count_y) {
    width = cell_count_x * gridfinity_pitch;
    depth = cell_count_y * gridfinity_pitch;

    difference() {
        rounded_box(width, depth, base_height, outer_corner_radius);
        socket_grid_cutouts(cell_count_x, cell_count_y, strong_socket_z());
        open_bottom_cutouts(cell_count_x, cell_count_y, base_height);
    }
}

module strong_bottom_braces(cell_count_x, cell_count_y, brace_height) {
    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                0
            ]) {
                strong_cell_x_brace(brace_height);
            }
        }
    }
}

module strong_cell_x_brace(brace_height) {
    eps = boolean_overlap;
    opening_size = bottom_opening_size();
    brace_width = effective_strong_brace_width();
    diagonal_length = opening_size * sqrt(2);

    intersection() {
        union() {
            rotate([0, 0, 45]) {
                translate([-diagonal_length / 2, -brace_width / 2, -eps]) {
                    cube([diagonal_length, brace_width, brace_height + 2 * eps]);
                }
            }

            rotate([0, 0, -45]) {
                translate([-diagonal_length / 2, -brace_width / 2, -eps]) {
                    cube([diagonal_length, brace_width, brace_height + 2 * eps]);
                }
            }
        }

        translate([-opening_size / 2, -opening_size / 2, -2 * eps]) {
            rounded_box(
                opening_size,
                opening_size,
                brace_height + 4 * eps,
                bottom_opening_radius()
            );
        }
    }
}


// =====================================================
// STRONG SCREW HOLE MODULES
// =====================================================

module screw_supports(cell_count_x, cell_count_y, support_height) {
    eps = boolean_overlap;

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                -eps
            ]) {
                cylinder(
                    h = support_height + 2 * eps,
                    d = screw_support_diameter()
                );
            }
        }
    }
}

module screw_hole_cutouts(cell_count_x, cell_count_y, cut_height) {
    eps = boolean_overlap;

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                -eps
            ]) {
                chamfered_screw_hole_cutout(cut_height + 2 * eps);
            }
        }
    }
}

module chamfered_screw_hole_cutout(cut_height) {
    eps = boolean_overlap;
    chamfer_z = max(0, cut_height - screw_chamfer_depth);

    union() {
        cylinder(
            h = cut_height + eps,
            d = screw_hole_diameter
        );

        if (screw_chamfer_depth > 0) {
            translate([0, 0, chamfer_z]) {
                cylinder(
                    h = screw_chamfer_depth + eps,
                    d1 = screw_hole_diameter,
                    d2 = screw_chamfer_diameter()
                );
            }
        }
    }
}


// =====================================================
// LIGHT GRID
// =====================================================

module light_grid(cell_count_x, cell_count_y) {
    height = light_grid_height();
    width = cell_count_x * gridfinity_pitch;
    depth = cell_count_y * gridfinity_pitch;

    intersection() {
        light_contour_body(cell_count_x, cell_count_y, height, width, depth);
        light_keep_mask(cell_count_x, cell_count_y, height, width, depth);
    }
}

module light_contour_body(cell_count_x, cell_count_y, height, width, depth) {
    difference() {
        rounded_box(width, depth, height, outer_corner_radius);
        socket_grid_cutouts(cell_count_x, cell_count_y, light_socket_z());
        light_bottom_cutouts(cell_count_x, cell_count_y);
    }
}

module light_keep_mask(cell_count_x, cell_count_y, height, width, depth) {
    union() {
        perimeter_wall(width, depth, height, light_wall_width);

        for (x = [0 : cell_count_x - 1]) {
            for (y = [0 : cell_count_y - 1]) {
                translate([
                    x * gridfinity_pitch + gridfinity_pitch / 2,
                    y * gridfinity_pitch + gridfinity_pitch / 2,
                    0
                ]) {
                    light_cell_shell(height);
                }
            }
        }
    }
}

module light_cell_shell(height) {
    socket_z = light_socket_z();
    lower_z = min(height, socket_z + lower_chamfer_height);
    middle_z = min(height, socket_z + lower_chamfer_height + middle_straight_height);
    top_flat_start = max(middle_z, height - light_top_flat_thickness);

    light_shell_segment(0, min(height, socket_z));

    if (height > socket_z) {
        light_shell_segment(socket_z, lower_z);
    }

    if (height > lower_z) {
        light_shell_segment(lower_z, middle_z);
    }

    if (height > middle_z) {
        if (top_flat_start > middle_z + 0.001) {
            light_shell_segment(middle_z, top_flat_start);
        }

        light_top_flat_cap(top_flat_start, height);
    }
}

module light_top_flat_cap(z_start, z_end) {
    eps = boolean_overlap;

    if (z_end > z_start + 0.001) {
        translate([0, 0, z_start - eps]) {
            rounded_box_centered(
                light_outer_size(z_end),
                light_outer_size(z_end),
                z_end - z_start + eps,
                light_outer_radius(z_end)
            );
        }
    }
}

module light_shell_segment(z_start, z_end) {
    eps = boolean_overlap;

    if (z_end > z_start + 0.001) {
        hull() {
            translate([0, 0, z_start - eps]) {
                rounded_box_centered(
                    light_outer_size(z_start),
                    light_outer_size(z_start),
                    eps,
                    light_outer_radius(z_start)
                );
            }

            translate([0, 0, z_end]) {
                rounded_box_centered(
                    light_outer_size(z_end),
                    light_outer_size(z_end),
                    eps,
                    light_outer_radius(z_end)
                );
            }
        }
    }
}

module light_bottom_cutouts(cell_count_x, cell_count_y) {
    opening_size = profile_size_at_z(lower_chamfer_height) + 0.05;
    opening_radius = profile_radius_at_z(lower_chamfer_height);
    cut_height = max(0.01, light_socket_z() + lower_chamfer_height + 2 * boolean_overlap);

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                -boolean_overlap
            ]) {
                rounded_box_centered(opening_size, opening_size, cut_height, opening_radius);
            }
        }
    }
}


// =====================================================
// ULTRA LIGHT GRID
// =====================================================

module ultra_light_grid(cell_count_x, cell_count_y) {
    height = ultra_light_grid_height();
    width = cell_count_x * gridfinity_pitch;
    depth = cell_count_y * gridfinity_pitch;
    eps = boolean_overlap;

    intersection() {
        union() {
            ultra_reference_zones(cell_count_x, cell_count_y, height, width, depth);
            ultra_internal_corner_braces(cell_count_x, cell_count_y);
            ultra_outer_rim(width, depth);
            ultra_outer_rim_ramps(cell_count_x, cell_count_y, width, depth);
            ultra_internal_ribs(cell_count_x, cell_count_y);
            ultra_y_connectors(cell_count_x, cell_count_y, height, width, depth);
        }

        translate([0, 0, -eps]) {
            rounded_box(width, depth, height + 2 * eps, outer_corner_radius);
        }
    }
}

module ultra_reference_zones(cell_count_x, cell_count_y, height, width, depth) {
    intersection() {
        light_grid(cell_count_x, cell_count_y);
        ultra_reference_zone_mask(cell_count_x, cell_count_y, height, width, depth);
    }
}

module ultra_reference_zone_mask(cell_count_x, cell_count_y, height, width, depth) {
    eps = boolean_overlap;

    intersection() {
        union() {
            for (x = [0 : cell_count_x]) {
                for (y = [0 : cell_count_y]) {
                    translate([x * gridfinity_pitch, y * gridfinity_pitch, 0]) {
                        ultra_sloped_reference_piece(height);
                    }
                }
            }
        }

        translate([0, 0, -2 * eps]) {
            rounded_box(width, depth, height + 4 * eps, outer_corner_radius);
        }
    }
}

module ultra_sloped_reference_piece(height) {
    eps = boolean_overlap;
    reference = ultra_corner_reference_size;
    bottom_size = 2 * reference;
    top_size = min(ultra_corner_slope_top_size, bottom_size - 0.01);
    bottom_radius = ultra_reference_radius(bottom_size);
    top_radius = ultra_reference_radius(top_size);
    slope_start = ultra_corner_slope_start_height(height);

    union() {
        translate([0, 0, -eps]) {
            rounded_box_centered(
                bottom_size,
                bottom_size,
                slope_start + eps,
                bottom_radius
            );
        }

        if (height > slope_start + 0.001) {
            hull() {
                translate([0, 0, slope_start - eps]) {
                    rounded_box_centered(bottom_size, bottom_size, eps, bottom_radius);
                }

                translate([0, 0, height - eps]) {
                    rounded_box_centered(top_size, top_size, eps, top_radius);
                }
            }
        }
    }
}

module ultra_internal_corner_braces(cell_count_x, cell_count_y) {
    if (cell_count_x > 1 && cell_count_y > 1) {
        for (x = [1 : cell_count_x - 1]) {
            for (y = [1 : cell_count_y - 1]) {
                translate([x * gridfinity_pitch, y * gridfinity_pitch, 0]) {
                    ultra_internal_corner_x_brace();
                }
            }
        }
    }
}

module ultra_internal_corner_x_brace() {
    eps = boolean_overlap;
    brace_width = ultra_internal_brace_width;
    brace_height = ultra_internal_brace_height;
    brace_span = ultra_internal_corner_span();
    diagonal_length = brace_span * sqrt(2);

    intersection() {
        union() {
            rotate([0, 0, 45]) {
                translate([-diagonal_length / 2, -brace_width / 2, -eps]) {
                    cube([diagonal_length, brace_width, brace_height + eps]);
                }
            }

            rotate([0, 0, -45]) {
                translate([-diagonal_length / 2, -brace_width / 2, -eps]) {
                    cube([diagonal_length, brace_width, brace_height + eps]);
                }
            }
        }

        translate([-brace_span / 2, -brace_span / 2, -2 * eps]) {
            cube([brace_span, brace_span, brace_height + 4 * eps]);
        }
    }
}

module ultra_outer_rim(width, depth) {
    perimeter_wall(width, depth, ultra_rib_height(), ultra_wall_width);
}

module ultra_outer_rim_ramps(cell_count_x, cell_count_y, width, depth) {
    wall = ultra_wall_width;
    reference = ultra_corner_reference_size;
    low_height = ultra_rib_height();
    high_height = ultra_rib_end_height(ultra_light_grid_height());

    for (x = [0 : cell_count_x - 1]) {
        segment_start = x * gridfinity_pitch + reference;
        segment_length = gridfinity_pitch - 2 * reference;

        if (segment_length > 0) {
            ultra_horizontal_edge_rib(segment_start, 0, segment_length, wall, low_height, high_height);
            ultra_horizontal_edge_rib(segment_start, depth - wall, segment_length, wall, low_height, high_height);
        }
    }

    for (y = [0 : cell_count_y - 1]) {
        segment_start = y * gridfinity_pitch + reference;
        segment_length = gridfinity_pitch - 2 * reference;

        if (segment_length > 0) {
            ultra_vertical_edge_rib(0, segment_start, segment_length, wall, low_height, high_height);
            ultra_vertical_edge_rib(width - wall, segment_start, segment_length, wall, low_height, high_height);
        }
    }
}

module ultra_horizontal_edge_rib(x_start, y_edge, length, wall, low_height, high_height) {
    eps = boolean_overlap;
    ramp_length = min(ultra_outer_rim_ramp_length, max(0.01, length / 2 - 0.01));
    center_length = max(0, length - 2 * ramp_length);

    if (center_length > 0.001) {
        translate([x_start + ramp_length, y_edge, -eps]) {
            cube([center_length, wall, low_height + 2 * eps]);
        }
    }

    hull() {
        translate([x_start, y_edge, -eps]) {
            cube([eps, wall, high_height + 2 * eps]);
        }

        translate([x_start + ramp_length, y_edge, -eps]) {
            cube([eps, wall, low_height + 2 * eps]);
        }
    }

    hull() {
        translate([x_start + length - ramp_length, y_edge, -eps]) {
            cube([eps, wall, low_height + 2 * eps]);
        }

        translate([x_start + length, y_edge, -eps]) {
            cube([eps, wall, high_height + 2 * eps]);
        }
    }
}

module ultra_vertical_edge_rib(x_edge, y_start, length, wall, low_height, high_height) {
    eps = boolean_overlap;
    ramp_length = min(ultra_outer_rim_ramp_length, max(0.01, length / 2 - 0.01));
    center_length = max(0, length - 2 * ramp_length);

    if (center_length > 0.001) {
        translate([x_edge, y_start + ramp_length, -eps]) {
            cube([wall, center_length, low_height + 2 * eps]);
        }
    }

    hull() {
        translate([x_edge, y_start, -eps]) {
            cube([wall, eps, high_height + 2 * eps]);
        }

        translate([x_edge, y_start + ramp_length, -eps]) {
            cube([wall, eps, low_height + 2 * eps]);
        }
    }

    hull() {
        translate([x_edge, y_start + length - ramp_length, -eps]) {
            cube([wall, eps, low_height + 2 * eps]);
        }

        translate([x_edge, y_start + length, -eps]) {
            cube([wall, eps, high_height + 2 * eps]);
        }
    }
}

module ultra_internal_ribs(cell_count_x, cell_count_y) {
    wall = ultra_wall_width;
    reference = ultra_corner_reference_size;
    rib_height = ultra_rib_height();

    if (cell_count_y > 1) {
        for (y = [1 : cell_count_y - 1]) {
            y_center = y * gridfinity_pitch;

            for (x = [0 : cell_count_x - 1]) {
                rib_start = x * gridfinity_pitch + reference + ultra_mid_rib_end_clearance;
                rib_length = gridfinity_pitch - 2 * reference - 2 * ultra_mid_rib_end_clearance;

                if (rib_length > 0) {
                    ultra_horizontal_mid_rib(rib_start, y_center, rib_length, wall, rib_height);
                }
            }
        }
    }

    if (cell_count_x > 1) {
        for (x = [1 : cell_count_x - 1]) {
            x_center = x * gridfinity_pitch;

            for (y = [0 : cell_count_y - 1]) {
                rib_start = y * gridfinity_pitch + reference + ultra_mid_rib_end_clearance;
                rib_length = gridfinity_pitch - 2 * reference - 2 * ultra_mid_rib_end_clearance;

                if (rib_length > 0) {
                    ultra_vertical_mid_rib(x_center, rib_start, rib_length, wall, rib_height);
                }
            }
        }
    }
}

module ultra_horizontal_mid_rib(x_start, y_center, length, wall, height) {
    eps = boolean_overlap;

    if (length > 0.001) {
        translate([x_start, y_center - wall / 2, -eps]) {
            cube([length, wall, height + 2 * eps]);
        }
    }
}

module ultra_vertical_mid_rib(x_center, y_start, length, wall, height) {
    eps = boolean_overlap;

    if (length > 0.001) {
        translate([x_center - wall / 2, y_start, -eps]) {
            cube([wall, length, height + 2 * eps]);
        }
    }
}

module ultra_y_connectors(cell_count_x, cell_count_y, height, width, depth) {
    eps = boolean_overlap;
    wall = ultra_wall_width;
    reference = ultra_corner_reference_size;
    connector_height = ultra_rib_end_height(height);
    connector_spread = ultra_connector_spread();

    intersection() {
        union() {
            if (cell_count_y > 1) {
                for (y = [1 : cell_count_y - 1]) {
                    y_center = y * gridfinity_pitch;

                    for (x = [0 : cell_count_x - 1]) {
                        left_anchor = x * gridfinity_pitch + reference + ultra_mid_rib_end_clearance;
                        right_anchor = (x + 1) * gridfinity_pitch - reference - ultra_mid_rib_end_clearance;

                        ultra_y_connector(left_anchor, y_center, -1, 0, ultra_y_connector_length, connector_spread, wall, connector_height);
                        ultra_y_connector(right_anchor, y_center, 1, 0, ultra_y_connector_length, connector_spread, wall, connector_height);
                    }
                }
            }

            if (cell_count_x > 1) {
                for (x = [1 : cell_count_x - 1]) {
                    x_center = x * gridfinity_pitch;

                    for (y = [0 : cell_count_y - 1]) {
                        bottom_anchor = y * gridfinity_pitch + reference + ultra_mid_rib_end_clearance;
                        top_anchor = (y + 1) * gridfinity_pitch - reference - ultra_mid_rib_end_clearance;

                        ultra_y_connector(x_center, bottom_anchor, 0, -1, ultra_y_connector_length, connector_spread, wall, connector_height);
                        ultra_y_connector(x_center, top_anchor, 0, 1, ultra_y_connector_length, connector_spread, wall, connector_height);
                    }
                }
            }
        }

        translate([0, 0, -2 * eps]) {
            rounded_box(width, depth, height + 4 * eps, outer_corner_radius);
        }
    }
}

module ultra_y_connector(anchor_x, anchor_y, dir_x, dir_y, branch_length, branch_spread, wall, height) {
    stem_length = min(ultra_y_stem_length, branch_length - 0.01);
    overlap = min(ultra_y_stem_overlap, ultra_mid_rib_end_clearance);
    low_height = ultra_rib_height();
    high_height = height;

    if (dir_x != 0) {
        stem_start_x = anchor_x - dir_x * overlap;
        stem_start_y = anchor_y;
        split_x = anchor_x + dir_x * stem_length;
        split_y = anchor_y;

        ultra_ramped_connector_arm(stem_start_x, stem_start_y, split_x, split_y, wall, low_height, high_height);
        ultra_straight_height_connector_arm(split_x, split_y, anchor_x + dir_x * branch_length, anchor_y - branch_spread, wall, high_height);
        ultra_straight_height_connector_arm(split_x, split_y, anchor_x + dir_x * branch_length, anchor_y + branch_spread, wall, high_height);
    }
    else {
        stem_start_x = anchor_x;
        stem_start_y = anchor_y - dir_y * overlap;
        split_x = anchor_x;
        split_y = anchor_y + dir_y * stem_length;

        ultra_ramped_connector_arm(stem_start_x, stem_start_y, split_x, split_y, wall, low_height, high_height);
        ultra_straight_height_connector_arm(split_x, split_y, anchor_x - branch_spread, anchor_y + dir_y * branch_length, wall, high_height);
        ultra_straight_height_connector_arm(split_x, split_y, anchor_x + branch_spread, anchor_y + dir_y * branch_length, wall, high_height);
    }
}

module ultra_straight_height_connector_arm(x_start, y_start, x_end, y_end, wall, height) {
    ultra_ramped_connector_arm(x_start, y_start, x_end, y_end, wall, height, height);
}

module ultra_ramped_connector_arm(x_start, y_start, x_end, y_end, wall, start_height, end_height) {
    eps = boolean_overlap;
    dx = x_end - x_start;
    dy = y_end - y_start;
    arm_angle = atan2(dy, dx);

    hull() {
        translate([x_start, y_start, -eps]) {
            rotate([0, 0, arm_angle]) {
                translate([-eps / 2, -wall / 2, 0]) {
                    cube([eps, wall, start_height + 2 * eps]);
                }
            }
        }

        translate([x_end, y_end, -eps]) {
            rotate([0, 0, arm_angle]) {
                translate([-eps / 2, -wall / 2, 0]) {
                    cube([eps, wall, end_height + 2 * eps]);
                }
            }
        }
    }
}


// =====================================================
// SHARED GRID CUTS
// =====================================================

module open_bottom_cutouts(cell_count_x, cell_count_y, cut_height) {
    opening_size = bottom_opening_size();
    opening_radius = bottom_opening_radius();

    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                -boolean_overlap
            ]) {
                rounded_box_centered(
                    opening_size,
                    opening_size,
                    cut_height + 2 * boolean_overlap,
                    opening_radius
                );
            }
        }
    }
}

module socket_grid_cutouts(cell_count_x, cell_count_y, socket_z) {
    for (x = [0 : cell_count_x - 1]) {
        for (y = [0 : cell_count_y - 1]) {
            translate([
                x * gridfinity_pitch + gridfinity_pitch / 2,
                y * gridfinity_pitch + gridfinity_pitch / 2,
                socket_z
            ]) {
                gridfinity_socket_cutout();
            }
        }
    }
}

module gridfinity_socket_cutout() {
    eps = boolean_overlap;
    top_extra = 1.0;

    union() {
        socket_profile_hull(0, lower_chamfer_height, eps);
        socket_profile_hull(lower_chamfer_height, lower_chamfer_height + middle_straight_height, eps);
        socket_profile_hull(lower_chamfer_height + middle_straight_height, gridfinity_profile_height, eps);

        translate([0, 0, gridfinity_profile_height - eps]) {
            rounded_box_centered(
                profile_size_at_z(gridfinity_profile_height),
                profile_size_at_z(gridfinity_profile_height),
                top_extra + 2 * eps,
                profile_radius_at_z(gridfinity_profile_height)
            );
        }
    }
}

module socket_profile_hull(z_start, z_end, eps) {
    hull() {
        translate([0, 0, z_start - eps]) {
            rounded_box_centered(
                profile_size_at_z(z_start),
                profile_size_at_z(z_start),
                eps,
                profile_radius_at_z(z_start)
            );
        }

        translate([0, 0, z_end]) {
            rounded_box_centered(
                profile_size_at_z(z_end),
                profile_size_at_z(z_end),
                eps,
                profile_radius_at_z(z_end)
            );
        }
    }
}


// =====================================================
// SHARED BASIC SHAPES
// =====================================================

module perimeter_wall(width, depth, height, wall) {
    eps = boolean_overlap;

    difference() {
        translate([0, 0, -eps]) {
            rounded_box(width, depth, height + 2 * eps, outer_corner_radius);
        }

        translate([wall, wall, -2 * eps]) {
            rounded_box(
                width - 2 * wall,
                depth - 2 * wall,
                height + 4 * eps,
                max(0.01, outer_corner_radius - wall)
            );
        }
    }
}

module rounded_box_centered(width, depth, height, radius) {
    translate([-width / 2, -depth / 2, 0]) {
        rounded_box(width, depth, height, radius);
    }
}

module rounded_box(width, depth, height, radius) {
    safe_width = max(0.01, width);
    safe_depth = max(0.01, depth);
    safe_height = max(0.01, height);
    safe_radius = max(0.01, min(radius, min(safe_width, safe_depth) / 2 - 0.01));

    hull() {
        translate([safe_radius, safe_radius, 0]) {
            cylinder(h = safe_height, r = safe_radius);
        }

        translate([safe_width - safe_radius, safe_radius, 0]) {
            cylinder(h = safe_height, r = safe_radius);
        }

        translate([safe_radius, safe_depth - safe_radius, 0]) {
            cylinder(h = safe_height, r = safe_radius);
        }

        translate([safe_width - safe_radius, safe_depth - safe_radius, 0]) {
            cylinder(h = safe_height, r = safe_radius);
        }
    }
}
