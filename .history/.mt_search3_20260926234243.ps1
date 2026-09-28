$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file, $to = 40) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $to -Headers @{ 'User-Agent' = $ua }
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()
$rep += (Save 'https://monstertrain.fandom.com/api.php?action=parse&page=Keywords&format=json&prop=wikitext' 'mt_api_kw.json' 45)
Start-Sleep -Seconds 1
$rep += (Save 'https://monstertrain.fandom.com/api.php?action=parse&page=Relics&format=json&prop=wikitext' 'mt_api_relic.json' 45)
Start-Sleep -Seconds 1
$rep += (Save 'https://en.wikipedia.org/wiki/Monster_Train' 'mt_wiki_en.txt' 45)
Start-Sleep -Seconds 1
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 关键词 狂怒 尖刺 攻略')) 'mt_sogou.txt' 30)
Start-Sleep -Seconds 1
$rep += (Save ('https://www.so.com/s?q=' + [uri]::EscapeDataString('怪物火车 关键词 狂怒 尖刺 攻略')) 'mt_so.txt' 30)
Start-Sleep -Seconds 1
$rep += (Save ('https://cn.bing.com/search?q=' + [uri]::EscapeDataString('"怪物火车" 关键词 狂怒 尖刺 多重打击') + '&ensearch=0') 'mt_bing3.txt' 30)

[IO.File]::WriteAllLines('mt_report3.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
