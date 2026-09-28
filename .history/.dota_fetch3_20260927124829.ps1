$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file, $ref = '', $to = 45) {
  try {
    $h = @{ 'User-Agent' = $ua; 'Accept' = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'; 'Accept-Language' = 'zh-CN,zh;q=0.9,en;q=0.8' }
    if ($ref) { $h['Referer'] = $ref }
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $to -Headers $h
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()
# biligame Dota2 wiki: item list (CN names + effects)
$rep += (Save ('https://wiki.biligame.com/dota2/' + [uri]::EscapeDataString('物品')) 'dota_cn_items.html')
# liquipedia retry with full browser headers
$rep += (Save 'https://liquipedia.net/dota2/Items' 'dota_liquipedia.html' 'https://www.google.com/')
# github tree: find localization files in GameTracking-Dota2
$rep += (Save 'https://api.github.com/repos/SteamDatabase/GameTracking-Dota2/git/trees/master?recursive=1' 'dota_gh_tree.json')

[IO.File]::WriteAllLines('dota_fetch_report3.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
