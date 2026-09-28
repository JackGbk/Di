$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$out = New-Object System.Collections.Generic.List[string]
$kw = '火车|狂怒|尖刺|神器|关键词|多重打击|横扫|碾压|薪火|卡牌|遗物'

foreach ($f in @('mt_sogou.txt', 'mt_so.txt', 'mt_bing3.txt')) {
  if (-not (Test-Path $f)) { continue }
  $t = [IO.File]::ReadAllText($f)
  $t = $t -replace '<script[\s\S]*?</script>', ' '
  $t = $t -replace '<style[\s\S]*?</style>', ' '
  $t = $t -replace '<!--[\s\S]*?-->', ' '
  $t = $t -replace '<br\s*/?>', "`n"
  $t = $t -replace '</(p|div|li|h\d|span|a|td)>', "`n"
  $t = $t -replace '<[^>]+>', ' '
  $t = $t -replace '&nbsp;|&ensp;|&emsp;', ' '
  $t = $t -replace '&', '&'
  $t = $t -replace '&#\d+;', ''
  $t = $t -replace '&[a-z]+;', ' '
  $lines = $t -split "`n"
  $out.Add("========== $f ==========")
  $seen = @{}
  foreach ($l in $lines) {
    $s = ($l -replace '[ \t　]+', ' ').Trim()
    if ($s.Length -lt 15) { continue }
    if ($s -notmatch $kw) { continue }
    $key = $s.Substring(0, [Math]::Min(60, $s.Length))
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1
    if ($s.Length -gt 400) { $s = $s.Substring(0, 400) }
    $out.Add($s)
  }
}
[IO.File]::WriteAllLines('mt_cn_extract.txt', [string[]]$out, [Text.UTF8Encoding]::new($false))
Write-Output ('lines=' + $out.Count)
