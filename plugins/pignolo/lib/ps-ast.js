'use strict';
// PowerShell por el AST nativo (spec §11.6): se lanza `powershell.exe -NoProfile`
// con System.Management.Automation.Language.Parser, que devuelve en JSON cada
// CommandAst (con sus elementos ya sin comillas ni escapes), cada llamada a
// método y cada asignación. La evaluación se hace en node (lib/git-guard.js).
// Si powershell.exe no arranca, vence o su salida no es JSON: PsUnavailable, y la
// guardia falla cerrado. Costo medido: ~0,25 s por comando (arranque de powershell.exe).
const { spawnSync } = require('node:child_process');

class PsUnavailable extends Error {}

// Por debajo del plazo de 3 s del launcher (spec §8.3): si powershell.exe se
// cuelga, vence este timeout y la guardia decide por el modo (ask en interactivo)
// antes de que el launcher niegue, salvo que la instantánea que sigue gaste el
// resto del plazo. Con 1,5 s fallaban parseos normales con la máquina cargada.
const PS_TIMEOUT_MS = 2000;

// El comando llega en base64 por stdin (evita problemas de codificación de la consola).
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$L = 'System.Management.Automation.Language.'
$raw = [Console]::In.ReadToEnd()
$src = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw.Trim()))
$tokens = $null; $errs = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($src, [ref]$tokens, [ref]$errs)
function Words($e) {
  $r = New-Object System.Collections.ArrayList
  if ($e -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
    [void]$r.Add(@{ v = $e.Value; q = ([string]$e.StringConstantType -ne 'BareWord') })
  } elseif ($e -is [System.Management.Automation.Language.CommandParameterAst]) {
    [void]$r.Add(@{ v = '-' + $e.ParameterName; k = 'param' })
    if ($e.Argument) { foreach ($x in (Words $e.Argument)) { [void]$r.Add($x) } }
  } elseif ($e -is [System.Management.Automation.Language.ExpandableStringExpressionAst]) {
    if ($e.NestedExpressions.Count -eq 0) { [void]$r.Add(@{ v = $e.Value; q = $true }) }
    else {
      $at = $e.NestedExpressions[0].Extent.StartOffset - $e.Extent.StartOffset - 1
      if ($at -lt 0) { $at = 0 }
      [void]$r.Add(@{ v = $e.Value; q = $true; d = $true; at = $at })
    }
  } elseif ($e -is [System.Management.Automation.Language.ArrayLiteralAst]) {
    foreach ($x in $e.Elements) { foreach ($y in (Words $x)) { [void]$r.Add($y) } }
  } elseif ($e -is [System.Management.Automation.Language.ScriptBlockExpressionAst]) {
    [void]$r.Add(@{ v = '{}'; k = 'scriptblock' })
  } elseif ($e -is [System.Management.Automation.Language.VariableExpressionAst] -and $e.VariablePath.UserPath -eq 'null') {
    [void]$r.Add(@{ v = '/dev/null' })
  } else {
    $t = $e.Extent.Text; if ($t.Length -gt 300) { $t = $t.Substring(0, 300) }
    [void]$r.Add(@{ v = $t; d = $true; at = 0 })
  }
  return ,$r
}
$cmds = New-Object System.Collections.ArrayList
foreach ($c in $ast.FindAll({ param($a) $a -is [System.Management.Automation.Language.CommandAst] }, $true)) {
  $ws = New-Object System.Collections.ArrayList
  foreach ($el in $c.CommandElements) { foreach ($x in (Words $el)) { [void]$ws.Add($x) } }
  $rs = New-Object System.Collections.ArrayList
  foreach ($rd in $c.Redirections) {
    if ($rd -is [System.Management.Automation.Language.FileRedirectionAst]) { foreach ($x in (Words $rd.Location)) { [void]$rs.Add($x) } }
  }
  $piped = $false; $in = $null; $pv = -1
  if ($c.Parent -is [System.Management.Automation.Language.PipelineAst]) {
    $i = $c.Parent.PipelineElements.IndexOf($c)
    $piped = $i -gt 0
    if ($piped) {
      $prev = $c.Parent.PipelineElements[$i - 1]
      if ($prev -is [System.Management.Automation.Language.CommandExpressionAst] -and $prev.Expression -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $in = $prev.Expression.Value }
      if ($prev -is [System.Management.Automation.Language.CommandAst]) { $pv = $prev.Extent.StartOffset }
    }
  }
  [void]$cmds.Add(@{ w = $ws; r = $rs; op = [string]$c.InvocationOperator; p = $piped; i = $in; o = $c.Extent.StartOffset; v = $pv })
}
$mems = New-Object System.Collections.ArrayList
foreach ($m in $ast.FindAll({ param($a) $a -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true)) {
  $t = $m.Expression
  if ($t -is [System.Management.Automation.Language.TypeExpressionAst]) { $tgt = 'type:' + $t.TypeName.FullName }
  else { $tgt = $t.Extent.Text; if ($tgt.Length -gt 300) { $tgt = $tgt.Substring(0, 300) }; $tgt = 'expr:' + $tgt }
  $name = $null
  if ($m.Member -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $name = $m.Member.Value }
  $as = New-Object System.Collections.ArrayList
  if ($m.Arguments) { foreach ($a in $m.Arguments) { foreach ($x in (Words $a)) { [void]$as.Add($x) } } }
  [void]$mems.Add(@{ t = $tgt; m = $name; a = $as })
}
$asg = New-Object System.Collections.ArrayList
foreach ($a in $ast.FindAll({ param($x) $x -is [System.Management.Automation.Language.AssignmentStatementAst] }, $true)) {
  $n = $null; $v = $null
  if ($a.Left -is [System.Management.Automation.Language.VariableExpressionAst]) { $n = $a.Left.VariablePath.UserPath }
  if ([string]$a.Operator -eq 'Equals' -and $a.Right -is [System.Management.Automation.Language.CommandExpressionAst]) {
    $e = $a.Right.Expression
    if ($e -is [System.Management.Automation.Language.StringConstantExpressionAst]) { $v = $e.Value }
    elseif ($e -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -and $e.NestedExpressions.Count -eq 0) { $v = $e.Value }
  }
  [void]$asg.Add(@{ l = $a.Left.Extent.Text; n = $n; v = $v })
}
$el = New-Object System.Collections.ArrayList
foreach ($e in $errs) { [void]$el.Add($e.Message) }
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::Out.Write((@{ e = $el; c = $cmds; m = $mems; a = $asg } | ConvertTo-Json -Depth 12 -Compress))
`;
const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64');

function toWord(x) {
  const value = String(x.v == null ? '' : x.v);
  const dyn = Boolean(x.d);
  return {
    value, dyn, dynAt: dyn ? Number(x.at) || 0 : -1, quoted: Boolean(x.q), startsQuoted: Boolean(x.q),
    glob: !dyn && x.k !== 'param' && /[*?[]/.test(value), unq: value, kind: x.k || null,
  };
}

// `--%` (stop-parsing): el resto de la línea llega como un solo elemento y va
// literal al programa; se parte en palabras y `%VAR%` cuenta como dinámico.
function stopParsing(words) {
  const k = words.findIndex((w) => w.value === '--%' && !w.quoted);
  if (k < 0) return words;
  const rest = words.slice(k + 1).map((w) => w.value).join(' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, k).concat(rest.map((v) => {
    const m = /%[^%\s]+%/.exec(v);
    return { ...toWord({ v }), dyn: Boolean(m), dynAt: m ? m.index : -1 };
  }));
}

// Devuelve { errors, cmds, members, assigns } con los comandos en el formato de
// lib/shell-parse.js (words, redirects, pipedIn, stdinBody, call).
// Memoria por proceso: un hook evalúa un solo comando, pero la recursión
// (powershell -c dentro de PowerShell) y los tests repiten textos.
const memo = new Map();

function parsePsAst(src, opts = {}) {
  const key = `${opts.exe || ''}|${src}`;
  if (memo.has(key)) return memo.get(key);
  const r = parsePsAstUncached(src, opts);
  if (memo.size > 256) memo.clear();
  memo.set(key, r);
  return r;
}

function parsePsAstUncached(src, { exe = 'powershell.exe', timeoutMs = PS_TIMEOUT_MS } = {}) {
  const r = spawnSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ENCODED], {
    input: Buffer.from(src, 'utf8').toString('base64'), encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw new PsUnavailable(`powershell.exe no arrancó (${r.error.code || r.error.message})`);
  if (r.status !== 0) throw new PsUnavailable(`powershell.exe salió con ${r.status}`);
  let j;
  try { j = JSON.parse(r.stdout); } catch (e) { throw new PsUnavailable('la salida del parser no es JSON'); }
  const list = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x]));
  const cmds = list(j.c).sort((a, b) => a.o - b.o).map((c) => ({
    words: stopParsing(list(c.w).map(toWord)),
    redirects: list(c.r).map((t) => ({ op: '>', target: toWord(t) })),
    pipedIn: Boolean(c.p),
    stdin: c.p ? 'pipe' : null,
    stdinBody: typeof c.i === 'string' ? c.i : undefined,
    call: c.op === 'Ampersand' ? '&' : (c.op === 'Dot' ? '.' : null),
    sub: false,
    raw: list(c.w).map((w) => w.v).join(' '),
    offset: c.o,
    prevOffset: typeof c.v === 'number' && c.v >= 0 ? c.v : null,
  }));
  // `prev`: el comando anterior del pipeline, si lo es (Get-ChildItem x | Remove-Item).
  for (const c of cmds) c.prev = c.prevOffset === null ? null : cmds.find((x) => x.offset === c.prevOffset) || null;
  return {
    errors: list(j.e),
    cmds,
    members: list(j.m).map((m) => ({ target: String(m.t || ''), member: m.m == null ? null : String(m.m), args: list(m.a).map(toWord) })),
    assigns: list(j.a).map((a) => ({ left: String(a.l || ''), name: a.n == null ? null : String(a.n), value: a.v == null ? null : String(a.v) })),
  };
}

module.exports = { parsePsAst, PsUnavailable, PS_TIMEOUT_MS };
