$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$latin1 = [Text.Encoding]::GetEncoding('ISO-8859-1')
$utf8 = [Text.UTF8Encoding]::new($false)
$files = @('mt_gy1_clean.txt', 'mt_ali1_clean.txt', 'mt_3dm1_clean.txt', 'mt_3dm2_clean.txt', 'mt_sogou_kw_clean.txt', 'mt_sogou_up_clean.txt', 'mt_sogou_boss_clean.txt')
foreach ($f in $files) {
  if (-not (Test-Path $f)) { continue }
  $s = [IO.File]::ReadAllText($f, $utf8)
  try {
    $bytes = $latin1.GetBytes($s)
    $fixed = $utf8.GetString($bytes)
    if ($fixed -match '[一-鿿]') {
      [IO.File]::WriteAllText($f, $fixed, $utf8)
      Write-Output "$f fixed"
    } else {
      Write-Output "$f already-ok-or-unknown"
    }
  } catch { Write-Output "$f ERR $($_.Exception.Message)" }
}
