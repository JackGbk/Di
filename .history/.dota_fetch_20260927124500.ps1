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
# 英文 wiki：物品总表（含被动技能说明）
$rep += (Save 'https://dota2.fandom.com/wiki/Items' 'dota_items_en.html')
# liquipedia 物品列表
$rep += (Save 'https://liquipedia.net/dota2/Items' 'dota_liquipedia.html')
# 中文 wiki 搜索结果（物品列表/合成表）
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('Dota2 物品 被动技能 格挡 反暴击 狂战斧 合成表')) 'dota_sogou1.html' 30)
$rep += (Save ('https://www.bing.com/search?q=' + [uri]::EscapeDataString('Dota2 items passive abilities list unique')) 'dota_bing1.html' 30)

[IO.File]::WriteAllLines('dota_fetch_report.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
