$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file, $to = 30) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $to -Headers @{ 'User-Agent' = $ua }
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()

# 1) extract real result urls from sogou html
$t = [IO.File]::ReadAllText('mt_sogou.txt')
$urls = New-Object System.Collections.Generic.List[string]
foreach ($m in [regex]::Matches($t, '"mu":"(https?:[^"]+)"')) {
  $u = $m.Groups[1].Value -replace '\\/', '/'
  if ($u -notmatch 'sogou\.com|so\.com') { $urls.Add($u) }
}
foreach ($m in [regex]::Matches($t, 'href="(https?://[^"]+)"')) {
  $u = $m.Groups[1].Value
  if ($u -match 'gamersky|ali213|3dm|docin|youxi|bilibili|douyu|nineton|yxb365') { $urls.Add($u) }
}
$uniq = $urls | Select-Object -Unique
$rep += ('found urls: ' + $uniq.Count)
$rep += ($uniq -join "`n")
[IO.File]::WriteAllLines('mt_urls.txt', [string[]]$uniq, [Text.UTF8Encoding]::new($false))

# 2) more targeted searches
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 关键词 多重打击 碾压 横扫 迅捷 说明')) 'mt_sogou_kw.txt' 30)
Start-Sleep -Seconds 1
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 单位 升级 打造 槽位 强化')) 'mt_sogou_up.txt' 30)
Start-Sleep -Seconds 1
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 护甲 机制 战斗 说明')) 'mt_sogou_armor.txt' 30)

[IO.File]::WriteAllLines('mt_report4.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep | Select-Object -First 3 | Out-String)
Write-Output ('urls=' + $uniq.Count)
