// The environment of every child process (claude, acceptance commands) is built from an allowlist: the parent
// environment (tokens, API keys, Claude Code settings) never leaks into a run.
const ENV_ALLOW = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'USERNAME', 'HOME',
  'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
];

// Returns the child's environment and the NAMES (never values) of every variable that was dropped.
// claude: true adds what the harness sets for Claude Code (CLAUDE_CONFIG_DIR, DISABLE_AUTOUPDATER); the acceptance
// commands get the same allowlist without those two.
export function buildChildEnv(cfg, parentEnv = process.env, { claude = true } = {}) {
  const allow = new Set([...ENV_ALLOW, ...(cfg.extraEnvAllow || []).map((n) => String(n).toUpperCase())]);
  const env = {};
  const dropped = [];
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === undefined) continue;
    if (allow.has(k.toUpperCase())) env[k] = v;
    else dropped.push(k);
  }
  if (claude) {
    env.CLAUDE_CONFIG_DIR = cfg.configDir;
    env.DISABLE_AUTOUPDATER = '1';
  }
  return { env, dropped: dropped.sort() };
}
