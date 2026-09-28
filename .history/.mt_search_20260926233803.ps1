$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Get-Page($url, $outFile) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 -Headers @{ 'User-Agent' = $ua }
    [IO.File]::WriteAllText($outFile, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) -> $outFile"
  } catch {
    return "FAIL $url :: $($_.Exception.Message)"
  }
}

$queries = @(
  @{ q = '怪物火车 关键词 狂怒 尖刺 多重打击'; f = 'mt_q1.txt' },
  @{ q = '怪物火车 神器 遗物 图鉴'; f = 'mt_q2.txt' },
  @{ q = '怪物火车 单位 升级 槽位 打造'; f = 'mt_q3.txt' },
  @{ q = '怪物火车 boss 首领 每关 特色'; f = 'mt_q4.txt' }
)

$report = @()
foreach ($item in $queries) {
  $enc = [uri]::EscapeDataString($item.q)
  $report += (Get-Page ("https://www.baidu.com/s?wd=" + $enc + "&rn=20") $item.f)
  Start-Sleep -Seconds 1
}

# steam store page (english keywords / description)
$report += (Get-Page 'https://store.steampowered.com/app/1102190/Monster_Train/' 'mt_steam.txt')
# try fandom again with longer timeout
try {
  $r = Invoke-WebRequest -Uri 'https://monstertrain.fandom.com/wiki/Keywords' -UseBasicParsing -TimeoutSec 30 -Headers @{ 'User-Agent' = $ua }
  [IO.File]::WriteAllText('mt_keywords.txt', $r.Content, [Text.UTF8Encoding]::new($false))
  $report += "OK fandom keywords $($r.Content.Length)"
} catch { $report += "FAIL fandom :: $($_.Exception.Message)" }

[IO.File]::WriteAllLines((Join-Path (Get-Location) 'mt_report.txt'), [string[]]$report, [Text.UTF8Encoding]::new($false))
Write-Output ($report -join "`n")
