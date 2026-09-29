# 简易 JS 结构校验：跟踪字符串/注释/正则状态，校验 () {} [] 计数平衡。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @('js\data.js', 'js\engine.js', 'js\ui.js', 'js\rogue.js', 'js\shop.js', 'js\main.js')
$bad = 0
foreach($f in $files){
  $src = [IO.File]::ReadAllText((Join-Path $root $f), [Text.Encoding]::UTF8)
  $n = $src.Length
  $mode = 'code'
  $prev = ''
  $dp = 0; $cp = 0; $bp = 0
  $err = $null
  for($i = 0; $i -lt $n; $i++){
    $c = $src[$i]
    if($i + 1 -lt $n){ $nx = $src[$i+1] } else { $nx = [char]0 }
    if($mode -eq 'code'){
      if($c -eq '/' -and $nx -eq '/'){ $mode = 'line'; $i++ }
      elseif($c -eq '/' -and $nx -eq '*'){ $mode = 'block'; $i++ }
      elseif($c -eq "'"){ $mode = 'squote' }
      elseif($c -eq '"'){ $mode = 'dquote' }
      elseif($c -eq '/' -and $prev -ne '' -and '(,=:[!&|?{};+*%~^'.Contains($prev)){ $mode = 'regex' }
      elseif($c -eq '('){ $dp++ }
      elseif($c -eq ')'){ $dp--; if($dp -lt 0){ $err = 'extra ) at offset ' + $i } }
      elseif($c -eq '{'){ $cp++ }
      elseif($c -eq '}'){ $cp--; if($cp -lt 0){ $err = 'extra } at offset ' + $i } }
      elseif($c -eq '['){ $bp++ }
      elseif($c -eq ']'){ $bp--; if($bp -lt 0){ $err = 'extra ] at offset ' + $i } }
      if(-not [char]::IsWhiteSpace($c) -and $err -eq $null){ $prev = $c }
    }
    elseif($mode -eq 'line'){ if($c -eq "`n"){ $mode = 'code' } }
    elseif($mode -eq 'block'){ if($c -eq '*' -and $nx -eq '/'){ $mode = 'code'; $i++ } }
    elseif($mode -eq 'squote'){ if($c -eq '\'){ $i++ } elseif($c -eq "'"){ $mode = 'code'; $prev = "'" } }
    elseif($mode -eq 'dquote'){ if($c -eq '\'){ $i++ } elseif($c -eq '"'){ $mode = 'code'; $prev = '"' } }
    elseif($mode -eq 'regex'){ if($c -eq '\'){ $i++ } elseif($c -eq '/'){ $mode = 'code'; $prev = '/' } }
    if($err){ break }
  }
  if(-not $err){
    if($mode -ne 'code' -and $mode -ne 'line'){ $err = 'unterminated ' + $mode }
    elseif($dp -ne 0){ $err = 'paren depth ' + $dp }
    elseif($cp -ne 0){ $err = 'brace depth ' + $cp }
    elseif($bp -ne 0){ $err = 'bracket depth ' + $bp }
  }
  if($err){ $bad++; Write-Output ('FAIL ' + $f + ' -> ' + $err) }
  else { Write-Output ('OK   ' + $f) }
}
exit $bad
