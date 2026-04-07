/**
 * Claude Desktop - Patch + Setup (HTTP/HTTPS support)
 *
 * Copies official Claude to a local portable dir, patches app.asar
 * to remove HTTPS-only restriction, writes 3P Gateway registry,
 * and launches the patched portable copy.
 *
 * Usage:
 *   node setup.js                     # Interactive
 *   node setup.js --from-cli          # Reuse CLI config
 *   node setup.js --url URL --key KEY # Manual
 *   node setup.js --patch-only        # Only patch asar, no registry
 *   node setup.js --uninstall         # Remove registry + portable dir
 *   node setup.js --status            # Show status
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

// ============ Paths ============
const PORTABLE_DIR = path.resolve(__dirname, 'claude-portable');
const PORTABLE_ASAR = path.join(PORTABLE_DIR, 'resources', 'app.asar');
const PORTABLE_EXE = path.join(PORTABLE_DIR, 'claude.exe');
const LAUNCHER = path.resolve(__dirname, 'launch.bat');
const TMP = path.resolve(__dirname, '_patch_tmp');
const CLI_SETTINGS = path.join(process.env.USERPROFILE || '', '.claude', 'settings.json');

function findClaudeAppDir() {
    // Method 1: PowerShell Get-AppxPackage
    try {
        const result = execSync(
            'powershell -NoProfile -Command "(Get-AppxPackage -Name \'*Claude*\').InstallLocation"',
            { stdio: 'pipe', encoding: 'utf-8' }
        ).trim();
        if (result && fs.existsSync(result)) {
            const d = path.join(result, 'app');
            if (fs.existsSync(path.join(d, 'resources', 'app.asar'))) return d;
        }
    } catch {}
    // Method 2: Scan WindowsApps
    const wa = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps');
    try {
        const dirs = fs.readdirSync(wa)
            .filter(e => /^Claude_[\d.]+_x64__/.test(e))
            .sort().reverse();
        if (!dirs.length) return null;
        const d = path.join(wa, dirs[0], 'app');
        return fs.existsSync(path.join(d, 'resources', 'app.asar')) ? d : null;
    } catch { return null; }
}

const OFFICIAL_DIR = findClaudeAppDir();
const OFFICIAL_ASAR = OFFICIAL_DIR ? path.join(OFFICIAL_DIR, 'resources', 'app.asar') : null;

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };

// ============ Helpers ============
const C = { r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', e: '\x1b[31m' };
const ok = m => console.log(`${C.g}  [+] ${m}${C.r}`);
const inf = m => console.log(`${C.c}  [i] ${m}${C.r}`);
const err = m => console.log(`${C.e}  [x] ${m}${C.r}`);
const wrn = m => console.log(`${C.y}  [!] ${m}${C.r}`);
const hdr = m => console.log(`${C.c}\n${m}${C.r}`);

function maskKey(k) {
    if (!k) return '(none)';
    return k.length > 12 ? k.slice(0, 8) + '...' + k.slice(-4) : '***';
}

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

function regAdd(key, name, value, type = 'REG_SZ') {
    const tmp = path.join(os.tmpdir(), '_claude_reg_' + Date.now() + '.reg');
    try {
        const hive = key.startsWith('HKLM') ? 'HKEY_LOCAL_MACHINE' : 'HKEY_CURRENT_USER';
        const subkey = key.replace(/^HKCU\\|^HKLM\\/, '');
        const fullKey = `${hive}\\${subkey}`;
        let regValue;
        if (type === 'REG_DWORD') {
            regValue = `dword:${parseInt(value).toString(16).padStart(8, '0')}`;
        } else {
            regValue = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        const content = `Windows Registry Editor Version 5.00\r\n\r\n[${fullKey}]\r\n"${name}"=${regValue}\r\n`;
        fs.writeFileSync(tmp, content, 'utf16le');
        const bom = Buffer.from([0xFF, 0xFE]);
        const body = fs.readFileSync(tmp);
        fs.writeFileSync(tmp, Buffer.concat([bom, body]));
        execSync(`regedit /s "${tmp}"`, { stdio: 'pipe' });
        return true;
    } catch { return false; }
    finally { try { fs.unlinkSync(tmp); } catch {} }
}

function pickRegKey() {
    try {
        execSync('reg add "HKCU\\SOFTWARE\\Policies\\Claude" /v _probe /t REG_SZ /d "" /f', { stdio: 'pipe' });
        execSync('reg delete "HKCU\\SOFTWARE\\Policies\\Claude" /v _probe /f', { stdio: 'pipe' });
        return 'HKCU\\SOFTWARE\\Policies\\Claude';
    } catch {
        return 'HKLM\\SOFTWARE\\Policies\\Claude';
    }
}

// ============ Read CLI config ============
function readCli() {
    if (!fs.existsSync(CLI_SETTINGS)) return null;
    try {
        const j = JSON.parse(fs.readFileSync(CLI_SETTINGS, 'utf-8'));
        const e = j.env || {};
        return {
            url: e.ANTHROPIC_BASE_URL || null,
            key: e.ANTHROPIC_AUTH_TOKEN || e.ANTHROPIC_API_KEY || e.API_KEY || null,
            model: e.ANTHROPIC_MODEL || null,
        };
    } catch { return null; }
}

// ============ Build portable + patch ============
function patchAsar() {
    if (!OFFICIAL_DIR || !OFFICIAL_ASAR || !fs.existsSync(OFFICIAL_ASAR)) {
        err('Official Claude not found');
        return false;
    }

    // Copy official Claude to portable dir
    inf('Copying official Claude to portable dir...');
    if (fs.existsSync(PORTABLE_DIR)) {
        // Only remove old portable if exe is not locked
        try {
            fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
        } catch {
            wrn('Portable dir locked (Claude running?), updating files...');
        }
    }
    if (!fs.existsSync(PORTABLE_DIR)) {
        fs.cpSync(OFFICIAL_DIR, PORTABLE_DIR, { recursive: true });
        ok('Copied official Claude to portable dir');
    } else {
        // Copy everything except locked exe
        const entries = fs.readdirSync(OFFICIAL_DIR, { withFileTypes: true });
        for (const entry of entries) {
            const src = path.join(OFFICIAL_DIR, entry.name);
            const dst = path.join(PORTABLE_DIR, entry.name);
            try { fs.cpSync(src, dst, { recursive: true, force: true }); } catch {}
        }
        ok('Updated portable dir');
    }

    // Extract asar from portable copy (not from WindowsApps)
    inf('Extracting app.asar...');
    fs.rmSync(TMP, { recursive: true, force: true });
    execSync(`npx asar extract "${PORTABLE_ASAR}" "${TMP}"`, { stdio: 'pipe' });

    const indexJs = path.join(TMP, '.vite', 'build', 'index.js');
    let code = fs.readFileSync(indexJs, 'utf-8');
    let patched = 0;

    // Patch: remove https-only restriction on baseUrl
    const httpsCheck = '.url().refine(t=>new URL(t).protocol==="https:",{message:"must use https"})';
    const httpsRepl = '.url()';
    if (code.includes(httpsCheck)) {
        code = code.replace(httpsCheck, httpsRepl);
        ok('Patch: removed HTTPS-only restriction on baseUrl');
        patched++;
    } else if (!code.includes(httpsCheck)) {
        inf('Patch: HTTPS restriction already removed');
    }

    if (patched > 0) {
        fs.writeFileSync(indexJs, code, 'utf-8');
    }

    // Repack to portable dir (local dir, no MSIX protection)
    inf('Repacking app.asar...');
    try {
        execSync(`npx asar pack "${TMP}" "${PORTABLE_ASAR}" --unpack-dir "node_modules/{@ant/claude-native,node-pty}/**"`, { stdio: 'pipe' });
    } catch (e) {
        err('Repack failed: ' + e.message);
        return false;
    }

    // Verify
    const verifyTmp = path.resolve(__dirname, '_verify_tmp');
    try {
        fs.rmSync(verifyTmp, { recursive: true, force: true });
        execSync(`npx asar extract "${PORTABLE_ASAR}" "${verifyTmp}"`, { stdio: 'pipe' });
        const liveCode = fs.readFileSync(
            path.join(verifyTmp, '.vite', 'build', 'index.js'), 'utf-8'
        );
        if (liveCode.includes(httpsCheck)) {
            err('Verification failed: patch not applied!');
            return false;
        }
        ok('Repack done + verified');
    } catch (e) {
        wrn('Could not verify: ' + e.message);
        ok('Repack done (unverified)');
    } finally {
        fs.rmSync(verifyTmp, { recursive: true, force: true });
    }

    fs.rmSync(TMP, { recursive: true, force: true });

    // Flip Electron fuses (allow loading asar from non-original location)
    inf('Flipping Electron fuses...');
    try {
        execSync(`npx --yes @electron/fuses write --app "${PORTABLE_EXE}" OnlyLoadAppFromAsar=off EnableEmbeddedAsarIntegrityValidation=off`, { stdio: 'pipe' });
        ok('Electron fuses flipped');
    } catch (e) {
        wrn('Fuse flip failed (may still work): ' + e.message);
    }

    // Create launcher
    fs.writeFileSync(LAUNCHER,
        `@echo off\r\ntitle Claude (Patched - 3P Gateway)\r\ncd /d "%~dp0claude-portable"\r\nstart "" "claude.exe" %*\r\n`
    );
    ok(`Launcher: ${LAUNCHER}`);

    return true;
}

// ============ Write registry ============
function writeRegistry(url, key, models) {
    const rk = pickRegKey();
    inf(`Registry: ${rk}`);

    try { execSync(`reg delete "${rk}" /f`, { stdio: 'pipe' }); } catch {}

    regAdd(rk, 'custom3pProvider', 'gateway');
    regAdd(rk, 'custom3pBaseUrl', url);
    regAdd(rk, 'custom3pApiKey', key);
    if (models) regAdd(rk, 'custom3pModels', models);
    regAdd(rk, 'disableEssentialTelemetry', '1', 'REG_DWORD');
    regAdd(rk, 'disableNonessentialTelemetry', '1', 'REG_DWORD');
    regAdd(rk, 'disableNonessentialServices', '1', 'REG_DWORD');
    regAdd(rk, 'disableAutoUpdates', '1', 'REG_DWORD');

    ok(`custom3pProvider = gateway`);
    ok(`custom3pBaseUrl = ${url}`);
    ok(`custom3pApiKey = ${maskKey(key)}`);
    if (models) ok(`custom3pModels = ${models}`);
    ok('Telemetry + auto-update disabled');

    try {
        const verify = execSync(`reg query "${rk}" /v custom3pModels`, { encoding: 'utf-8' });
        if (models && models.includes('"') && !verify.includes('"id"')) {
            wrn('WARNING: JSON quotes may be corrupted in registry!');
        }
    } catch {}
}

function removeRegistry() {
    for (const h of ['HKCU\\SOFTWARE\\Policies\\Claude', 'HKLM\\SOFTWARE\\Policies\\Claude']) {
        try { execSync(`reg delete "${h}" /f`, { stdio: 'pipe' }); } catch {}
    }
    ok('Registry config removed');
}

// ============ Status ============
function showStatus() {
    hdr('===== Patch Status =====');
    if (OFFICIAL_ASAR) inf(`Official asar: ${OFFICIAL_ASAR}`);
    else err('Official Claude not found');

    if (fs.existsSync(PORTABLE_ASAR)) {
        ok(`Portable: ${PORTABLE_DIR}`);
        // Check if patched
        try {
            const vtmp = path.resolve(__dirname, '_status_tmp');
            fs.rmSync(vtmp, { recursive: true, force: true });
            execSync(`npx asar extract "${PORTABLE_ASAR}" "${vtmp}"`, { stdio: 'pipe' });
            const code = fs.readFileSync(path.join(vtmp, '.vite', 'build', 'index.js'), 'utf-8');
            const hasHttps = code.includes('.url().refine(t=>new URL(t).protocol==="https:"');
            inf(`HTTPS restriction: ${hasHttps ? 'present (NOT patched)' : 'removed (patched)'}`);
            fs.rmSync(vtmp, { recursive: true, force: true });
        } catch {}
    } else {
        inf('Portable: not created');
    }

    hdr('===== Registry Status =====');
    let found = false;
    for (const h of ['HKCU\\SOFTWARE\\Policies\\Claude', 'HKLM\\SOFTWARE\\Policies\\Claude']) {
        try {
            const out = execSync(`reg query "${h}"`, { encoding: 'utf-8' });
            ok(`${h}:`);
            out.split('\n').forEach(l => { if (l.match(/^\s+\S/)) console.log(`    ${l.trim()}`); });
            found = true;
        } catch {}
    }
    if (!found) inf('Registry not configured');

    const cli = readCli();
    if (cli) {
        hdr('===== CLI Config =====');
        inf(`URL=${cli.url}  Key=${maskKey(cli.key)}  Model=${cli.model}`);
    }
    console.log('');
}

// ============ Kill Desktop only (not CLI) ============
function killDesktop() {
    try {
        const ps = execSync(
            'powershell -NoProfile -Command "Get-Process claude -ErrorAction SilentlyContinue | Select-Object Id,Path | ConvertTo-Csv -NoTypeInformation"',
            { encoding: 'utf-8' }
        );
        const lines = ps.trim().split('\n').slice(1);
        let killed = 0;
        for (const line of lines) {
            const match = line.match(/"(\d+)","(.+?)"/);
            if (!match) continue;
            const [, pid, exePath] = match;
            // Kill WindowsApps Desktop AND portable Desktop, NOT .local/bin CLI
            if (exePath.includes('WindowsApps') || exePath.includes('claude-portable')) {
                try { process.kill(parseInt(pid)); killed++; } catch {}
            }
        }
        if (killed > 0) ok(`Killed ${killed} Desktop process(es) (CLI untouched)`);
        else inf('No Desktop processes found');
    } catch { inf('Could not enumerate processes'); }
}

// ============ Launch portable ============
function launchPortable() {
    if (!fs.existsSync(PORTABLE_EXE)) {
        wrn('Portable exe not found, please start manually');
        return;
    }
    try {
        execSync(`start "" "${PORTABLE_EXE}"`, { stdio: 'pipe', shell: true });
        ok('Launched portable Claude');
    } catch {
        wrn('Auto-launch failed. Double-click launch.bat to start.');
    }
}

// ============ Interactive ============
async function interactive() {
    hdr('===== Claude Desktop No-Login Setup (patch mode, HTTP+HTTPS) =====');

    let url, key, models;

    const cli = readCli();
    if (cli && cli.url) {
        ok(`CLI config: ${cli.url} | ${maskKey(cli.key)} | ${cli.model}`);
        const ch = await ask('  Reuse? [Y/n] ');
        if (ch === '' || /^[Yy]/.test(ch)) {
            url = cli.url;
            key = cli.key;
            if (cli.model) models = `[{"id":"${cli.model}","name":"${cli.model}"}]`;
        }
    }

    if (!url) {
        url = await ask('  Base URL (HTTP or HTTPS): ');
        if (!url) { err('Cancelled'); return; }
        key = await ask('  API Key: ');
        if (!key) { err('Cancelled'); return; }
        const m = await ask('  Models JSON (enter to skip): ');
        if (m) models = m;
    }

    // Always patch for HTTP; for HTTPS still build portable for consistency
    if (url.startsWith('http://')) {
        inf('HTTP endpoint detected - building patched portable...');
    } else {
        inf('HTTPS endpoint - building portable (no patch needed, but portable is cleaner)...');
    }
    if (!patchAsar()) {
        err('Patch failed.');
        return;
    }

    writeRegistry(url, key, models);
    killDesktop();
    launchPortable();

    console.log(`\n${C.g}  Done! Patched Claude launched.${C.r}`);
    console.log(`${C.c}  Next time: double-click launch.bat${C.r}\n`);
}

// ============ Main ============
async function main() {
    if (flag('--help') || flag('-h')) {
        console.log(`
  Patch mode (HTTP + HTTPS support) — Portable build
  ====================================================
  node setup.js                      Interactive (auto-detects CLI)
  node setup.js --from-cli           Reuse ~/.claude/settings.json
  node setup.js --url URL --key KEY  Manual
  node setup.js --patch-only         Only build patched portable
  node setup.js --uninstall          Remove registry + portable dir
  node setup.js --status             Show status
`);
    } else if (flag('--status')) {
        showStatus();
    } else if (flag('--uninstall')) {
        removeRegistry();
        killDesktop();
        if (fs.existsSync(PORTABLE_DIR)) {
            inf('Waiting for processes to exit...');
            execSync('ping -n 3 127.0.0.1 >nul', { stdio: 'pipe' });
            try {
                fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
                ok('Portable dir removed');
            } catch {
                wrn('Could not remove portable dir (close Claude first)');
            }
        }
        if (fs.existsSync(LAUNCHER)) fs.unlinkSync(LAUNCHER);
        ok('Uninstall complete');
    } else if (flag('--patch-only')) {
        patchAsar();
    } else if (flag('--from-cli')) {
        const cli = readCli();
        if (!cli || !cli.url) { err('CLI config not found'); process.exit(1); }
        if (!patchAsar()) { err('Patch failed'); process.exit(1); }
        let mdl = argVal('--models');
        if (!mdl && cli.model) mdl = `[{"id":"${cli.model}","name":"${cli.model}"}]`;
        writeRegistry(cli.url, cli.key, mdl);
        killDesktop();
        launchPortable();
        console.log(`\n${C.g}  Done! Patched Claude launched.${C.r}\n`);
    } else if (argVal('--url')) {
        const url = argVal('--url'), key = argVal('--key');
        if (!key) { err('--key required'); process.exit(1); }
        if (!patchAsar()) { err('Patch failed'); process.exit(1); }
        writeRegistry(url, key, argVal('--models'));
        killDesktop();
        launchPortable();
        console.log(`\n${C.g}  Done! Patched Claude launched.${C.r}\n`);
    } else {
        await interactive();
    }
}

main().catch(e => { err(e.message); process.exit(1); });
