$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file, $ref = '', $to = 60) {
  try {
    $h = @{ 'User-Agent' = $ua; 'Accept' = 'application/json,text/html,*/*;q=0.8' }
    if ($ref) { $h['Referer'] = $ref }
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $to -Headers $h
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()
# OpenDota constants: all items with cost / attributes / behavior / lore
$rep += (Save 'https://api.opendota.com/api/constants/items' 'dota_od_items.json')
# liquipedia MediaWiki API (often not blocked like HTML pages)
$rep += (Save 'https://liquipedia.net/dota2/api.php?action=parse&page=Items&format=json&prop=wikitext' 'dota_lp_items.json' 'https://liquipedia.net/dota2/Items')

[IO.File]::WriteAllLines('dota_fetch_report4.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
