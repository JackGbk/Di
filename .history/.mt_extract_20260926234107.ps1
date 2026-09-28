$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$out = New-Object System.Collections.Generic.List[string]

foreach ($f in @('mt_bing1.txt', 'mt_bing2.txt')) {
  if (-not (Test-Path $f)) { continue }
  $t = [IO.File]::ReadAllText($f)
  $out.Add("========== $f ==========")
  $blocks = [regex]::Matches($t, '<li class="b_algo"[\s\S]*?</li>')
  foreach ($b in $blocks) {
    $txt = $b.Value -replace '<script[\s\S]*?</script>', '' -replace '<style[\s\S]*?</style>', ''
    $txt = $txt -replace '<br\s*/?>', "`n" -replace '</(p|h2|h3|div|span)>', "`n" -replace '<[^>]+>', ' ' -replace '&nbsp;', ' ' -replace '&', '&' -replace '&#\d+;', ''
    $txt = ($txt -replace '[ \t]+', ' ') -replace '(\r?\n\s*)+', "`n"
    $txt = $txt.Trim()
    if ($txt.Length -gt 40) { $out.Add($txt); $out.Add('--------------------------------') }
  }
}
[IO.File]::WriteAllLines('mt_bing_extract.txt', [string[]]$out, [Text.UTF8Encoding]::new($false))
Write-Output ('blocks=' + $out.Count)
