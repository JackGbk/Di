$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save($url, $file, $to = 30) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $to -Headers @{ 'User-Agent' = $ua; 'Referer' = 'https://www.sogou.com/' }
    [IO.File]::WriteAllText($file, $r.Content, [Text.UTF8Encoding]::new($false))
    return "OK $($r.Content.Length) $file"
  } catch { return "FAIL $file :: $($_.Exception.Message)" }
}

$rep = @()
$rep += (Save 'https://www.gamersky.com/handbook/202006/1295217.shtml' 'mt_gy1.txt')
$rep += (Save 'https://www.3dmgame.com/gl/3811328.html' 'mt_3dm1.txt')
$rep += (Save 'https://www.3dmgame.com/gl/3811310.html' 'mt_3dm2.txt')
$rep += (Save 'https://gl.ali213.net/html/2020-5/438229_6.html' 'mt_ali1.txt')
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 单位 升级 打造 槽位')) 'mt_sogou_up.txt' 30)
$rep += (Save ('https://www.sogou.com/web?query=' + [uri]::EscapeDataString('怪物火车 契约 难度 关卡 每关 boss 首领')) 'mt_sogou_boss.txt' 30)

[IO.File]::WriteAllLines('mt_report5.txt', [string[]]$rep, [Text.UTF8Encoding]::new($false))
Write-Output ($rep -join "`n")
