$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 -Headers @{ 'User-Agent' = $ua }
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()
# steam description extract
try {
  $t = [IO.File]::ReadAllText('mt_steam.txt')
  $m = [regex]::Match($t, 'game_area_description[\s\S]{0,200}?>([\s\S]{200,6000}?)</div>')
  if ($m.Success) {
    $d = $m.Groups[1].Value -replace '<br\s*/?>', "`n" -replace '<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&', '&'
    [IO.File]::WriteAllText('mt_steam_desc.txt', $d, [Text.UTF8Encoding]::new($false))
    $rep += "steam desc saved $($d.Length)"
  } else { $rep += 'steam desc not found' }
} catch { $rep += "steam desc fail $($_.Exception.Message)" }

# bing cn search
$rep += (Save ('https://cn.bing.com/search?q=' + [uri]::EscapeDataString('怪物火车 关键词 狂怒 尖刺 多重打击 攻略') + '&setmkt=zh-CN') 'mt_bing1.txt')
Start-Sleep -Seconds 1
$rep += (Save ('https://cn.bing.com/search?q=' + [uri]::EscapeDataString('monster train keyword armor rage spikes multistrike trample sweep')) 'mt_bing2.txt')
Start-Sleep -Seconds 1
# steamcommunity guide search
$rep += (Save 'https://steamcommunity.com/app/1102190/guides/' 'mt_guides.txt')
Start-Sleep -Seconds 1
# try monster train wiki alternatives
$rep += (Save 'https://monstertrain.wiki.gg/wiki/Keywords' 'mt_wikigg.txt')
Start-Sleep -Seconds 1
$rep += (Save 'https://monster-train.fandom.com/wiki/Keywords' 'mt_fandom2.txt')

[IO.File]::WriteAllLines('mt_report2.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
