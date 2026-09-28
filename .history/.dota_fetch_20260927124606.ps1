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
# English wiki: item list with passive ability descriptions
$rep += (Save 'https://dota2.fandom.com/wiki/Items' 'dota_items_en.html')
# liquipedia item list
$rep += (Save 'https://liquipedia.net/dota2/Items' 'dota_liquipedia.html')
# search: unique passive item mechanics reference
$q1 = [uri]::EscapeDataString('Dota2 items passive abilities list unique blocking cleave')
$q2 = [uri]::EscapeDataString('Dota 2 item mechanics guide tank damage dealer mage items')
$rep += (Save ('https://www.bing.com/search?q=' + $q1) 'dota_bing1.html' 30)
$rep += (Save ('https://www.bing.com/search?q=' + $q2) 'dota_bing2.html' 30)

[IO.File]::WriteAllLines('dota_fetch_report.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
