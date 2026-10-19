@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath '%~f0' -Encoding UTF8 | Select-Object -Skip 4) -join [char]10)"
pause
exit /b
# ---------------------------------------------------------------------------
# Animation Player: KI-Bewegungen einlesen / read AI motions
#
# Liest Titel und Länge der KI-Bewegungen aus
#   Documents\inZOI\AIGenerated\MyAIMotions\<Ordner>\meta.json + motion.dat
# und schreibt sie für den Reiter "KI-Bewegungen" nach
#   Documents\inZOI\Mods\InGame\Animation_Player_4B649335\ui\animation_player\saved\ai_motions.cfg
#
# Reads title and length of your AI motions and writes them for the
# "AI Motions" tab. Run again after adding or deleting AI motions.
# ---------------------------------------------------------------------------
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$docs  = [Environment]::GetFolderPath('MyDocuments')
$src   = Join-Path $docs 'inZOI\AIGenerated\MyAIMotions'
$saved = Join-Path $docs 'inZOI\Mods\InGame\Animation_Player_4B649335\ui\animation_player\saved'

if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "Ordner nicht gefunden / folder not found: $src" -ForegroundColor Red
    return
}

# Das Spiel belegt die Slots in alphabetischer Reihenfolge der Ordnernamen.
# The game fills the slots in alphabetical order of the folder names.
$dirs = @(Get-ChildItem -LiteralPath $src -Directory |
          Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'motion.dat') })
$names = [string[]]($dirs | ForEach-Object { $_.Name })
[Array]::Sort($names, [StringComparer]::OrdinalIgnoreCase)

$list = @()
$slot = 0
foreach ($n in $names) {
    if ($slot -ge 30) { break }
    $dir = Join-Path $src $n
    $title = $n
    try {
        $meta = Get-Content -LiteralPath (Join-Path $dir 'meta.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($meta.Title) { $title = [string]$meta.Title }
    } catch {}
    # motion.dat: int32 Version, int32 Frames, ... (30 Frames pro Sekunde)
    $frames = 0
    try {
        $fs = [IO.File]::OpenRead((Join-Path $dir 'motion.dat'))
        $br = New-Object IO.BinaryReader $fs
        [void]$br.ReadInt32()
        $frames = $br.ReadInt32()
        $br.Close()
    } catch {}
    $list += [pscustomobject]@{ slot = $slot; title = $title; frames = $frames }
    Write-Host ("{0,2}. {1}  ({2:N1} s)" -f ($slot + 1), $title, ($frames / 30))
    $slot++
}

if ($names.Count -gt 30) {
    Write-Host "Mehr als 30 Bewegungen: das Spiel lädt nur 30. / More than 30 motions: the game loads only 30." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $saved | Out-Null
$json = ConvertTo-Json -InputObject @($list) -Compress
[IO.File]::WriteAllText((Join-Path $saved 'ai_motions.cfg'), $json, (New-Object Text.UTF8Encoding $false))
Write-Host ""
Write-Host "$($list.Count) KI-Bewegungen gespeichert / AI motions saved." -ForegroundColor Green
Write-Host "Im Spiel: Reiter 'KI-Bewegungen' > 'Neu laden'. / In game: tab 'AI Motions' > 'Reload'."
