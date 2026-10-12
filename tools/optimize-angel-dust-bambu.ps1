param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
    throw "Input 3MF was not found: $InputPath"
}

$inputFull = (Resolve-Path -LiteralPath $InputPath).Path
$outputFull = [IO.Path]::GetFullPath($OutputPath)
$outputDir = Split-Path -Parent $outputFull
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}
if ([StringComparer]::OrdinalIgnoreCase.Equals($inputFull, $outputFull)) {
    throw 'Output must be a separate file so the supplied source remains unchanged.'
}

$source = [IO.Compression.ZipFile]::OpenRead($inputFull)
$destination = [IO.Compression.ZipFile]::Open($outputFull, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $source.Entries) {
        if ($entry.FullName -in @('Metadata/project_settings.config', 'Metadata/model_settings.config')) {
            continue
        }
        $newEntry = $destination.CreateEntry($entry.FullName, [IO.Compression.CompressionLevel]::Optimal)
        $inStream = $entry.Open()
        $outStream = $newEntry.Open()
        try {
            $inStream.CopyTo($outStream)
        }
        finally {
            $outStream.Dispose()
            $inStream.Dispose()
        }
    }

    $settingsEntry = $source.GetEntry('Metadata/project_settings.config')
    if (-not $settingsEntry) {
        throw 'The source 3MF does not contain Metadata/project_settings.config.'
    }
    $reader = [IO.StreamReader]::new($settingsEntry.Open())
    try { $settings = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $project = $settings | ConvertFrom-Json
    function Set-ProjectValue([object]$Object, [string]$Name, [object]$Value) {
        $property = $Object.PSObject.Properties[$Name]
        if ($null -eq $property) {
            $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
        }
        else {
            $Object.$Name = $Value
        }
    }

    # Keep the source paint groups and their order; only change the active slot palette.
    Set-ProjectValue $project 'filament_colour' @('#F9EEF2FF', '#FF1493FF', '#FF00FFFF', '#000000FF', '#D4AF37FF')
    Set-ProjectValue $project 'filament_settings_id' @(
        'Bambu PLA Basic @BBL X2D 0.4 nozzle',
        'Bambu PLA Basic @BBL X2D 0.4 nozzle',
        'Bambu PLA Basic @BBL X2D 0.4 nozzle',
        'Bambu PLA Basic @BBL X2D 0.4 nozzle',
        'Bambu PLA Basic @BBL X2D 0.4 nozzle'
    )
    Set-ProjectValue $project 'filament_type' @('PLA', 'PLA', 'PLA', 'PLA', 'PLA')
    Set-ProjectValue $project 'filament_minimal_purge_on_wipe_tower' @('15', '15', '15', '15', '15')
    Set-ProjectValue $project 'filament_flow_ratio' @('0.98', '0.98', '0.98', '0.98', '0.98')
    Set-ProjectValue $project 'filament_diameter' @('1.75', '1.75', '1.75', '1.75', '1.75')

    # Waste controls that remain conservative enough for a dense multicolor mesh.
    $project.enable_prime_tower = '1'
    $project.prime_tower_width = '16'
    $project.prime_tower_brim_width = '2'
    $project.prime_volume = '15'
    $project.flush_into_infill = '1'
    $project.flush_into_objects = '0'
    $project.flush_into_support = '1'
    $project.flush_multiplier = '1'
    $project.wipe_tower_no_sparse_layers = '1'
    $project.wipe_tower_x = @('15')
    $project.wipe_tower_y = @('145')

    # Support defaults tuned for a figurine: organic/tree, plate-only, conservative angle.
    Set-ProjectValue $project 'enable_support' '1'
    Set-ProjectValue $project 'support_type' 'tree(auto)'
    Set-ProjectValue $project 'support_on_build_plate_only' '1'
    Set-ProjectValue $project 'support_threshold_angle' '50'
    Set-ProjectValue $project 'support_top_z_distance' '0.2'
    Set-ProjectValue $project 'support_filament' '1'
    Set-ProjectValue $project 'support_interface_filament' '1'
    Set-ProjectValue $project 'wall_loops' '3'
    Set-ProjectValue $project 'brim_type' 'outer_only'
    Set-ProjectValue $project 'brim_width' '3'

    Set-ProjectValue $project 'printer_model' 'Bambu Lab X2D'
    Set-ProjectValue $project 'printer_settings_id' 'Bambu Lab X2D 0.4 nozzle'
    Set-ProjectValue $project 'print_settings_id' '0.20mm Standard @BBL X2D'
    Set-ProjectValue $project 'nozzle_diameter' @('0.4')
    Set-ProjectValue $project 'version' '02.08.02.61'
    Set-ProjectValue $project 'name' 'Angel Dust - Bambu X2D optimized'

    $json = $project | ConvertTo-Json -Depth 20
    $outSettings = $destination.CreateEntry('Metadata/project_settings.config', [IO.Compression.CompressionLevel]::Optimal)
    $writer = [IO.StreamWriter]::new($outSettings.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($json) } finally { $writer.Dispose() }

    $modelSettingsEntry = $destination.CreateEntry('Metadata/model_settings.config', [IO.Compression.CompressionLevel]::Optimal)
    $modelWriter = [IO.StreamWriter]::new($modelSettingsEntry.Open(), [Text.UTF8Encoding]::new($false))
    try {
        $modelWriter.Write(@'
<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="2">
    <metadata key="name" value="Angel Dust"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="638705"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="Angel Dust"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value="model.glb"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="0"/>
      <mesh_stat face_count="638705" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Angel Dust X2D optimized"/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="2"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble>
  </assemble>
</config>
'@)
    }
    finally { $modelWriter.Dispose() }
}
finally {
    $destination.Dispose()
    $source.Dispose()
}

Write-Output $outputFull
