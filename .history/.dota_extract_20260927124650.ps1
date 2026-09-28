$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$files = @('dota_bing1.html', 'dota_bing2.html')
$kw = 'passive|item|cleave|block|lifesteal|crit|blink|tank|mage|physical|aura|stun|slow|pierce|resist|damage'
$out = New-Object System.Collections.Generic.List[string]
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $t = [IO.File]::ReadAllText($f)
  $t = $t -replace '<script[\s\S]*?</script>', ' '
  $t = $t -replace '<style[\s\S]*?</style>', ' '
  $t = $t -replace '<!--[\s\S]*?-->', ' '
  $t = $t -replace '<br\s*/?>', "`n"
  $t = $t -replace '</(p|div|li|h\d|tr|td|span|a|cite)>', "`n"
  $t = $t -replace '<[^>]+>', ' '
  $t = $t -replace '&nbsp;|&ensp;|&emsp;', ' '
  $t = $t -replace '&#\d+;', ''
  $t = $t -replace '&[a-z]+;', ' '
  $out.Add("========== $f ==========")
  $seen = @{}
  foreach ($l in ($t -split "`n")) {
    $s = ($l -replace '[ \t]+', ' ').Trim()
    if ($s.Length -lt 20) { continue }
    if ($s -notmatch $kw) { continue }
    $key = $s.Substring(0, [Math]::Min(60, $s.Length))
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1
    if ($s.Length -gt 300) { $s = $s.Substring(0, 300) }
    $out.Add($s)
  }
}
[IO.File]::WriteAllLines('dota_items_extract.txt', [string[]]$out, [Text.UTF8Encoding]::new($false))
Write-Output ('lines=' + $out.Count)
