$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$files = @('mt_gy1.txt', 'mt_3dm1.txt', 'mt_3dm2.txt', 'mt_ali1.txt', 'mt_sogou_kw.txt', 'mt_sogou_up.txt', 'mt_sogou_boss.txt')
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $t = [IO.File]::ReadAllText($f)
  $t = $t -replace '<script[\s\S]*?</script>', ' '
  $t = $t -replace '<style[\s\S]*?</style>', ' '
  $t = $t -replace '<!--[\s\S]*?-->', ' '
  $t = $t -replace '<br\s*/?>', "`n"
  $t = $t -replace '</(p|div|li|h\d|tr|td|span|a)>', "`n"
  $t = $t -replace '<[^>]+>', ' '
  $t = $t -replace '&nbsp;|&ensp;|&emsp;', ' '
  $t = $t -replace '&', '&'
  $t = $t -replace '&[a-z]+;', ' '
  $t = $t -replace '&#\d+;', ''
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($l in ($t -split "`n")) {
    $s = ($l -replace '[ \t　]+', ' ').Trim()
    if ($s.Length -ge 8) { $lines.Add($s) }
  }
  $outFile = ($f -replace '\.txt$', '_clean.txt')
  [IO.File]::WriteAllLines($outFile, [string[]]$lines, [Text.UTF8Encoding]::new($false))
  Write-Output ("$outFile lines=" + $lines.Count)
}
