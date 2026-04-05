const { execSync, spawn } = require('child_process');
const path = require('path');

const exePath = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\claude.exe";
const cwd = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable";

// Launch with logging enabled
const child = spawn(exePath, [
    '--enable-logging',
    '--v=1',
    '--log-level=0',
], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
});

let stderr = '';
let stdout = '';

child.stdout.on('data', d => { stdout += d.toString(); });
child.stderr.on('data', d => { stderr += d.toString(); });

child.on('exit', (code) => {
    console.log("Exit code:", code);
    if (stdout) console.log("STDOUT:", stdout.substring(0, 2000));
    if (stderr) {
        console.log("STDERR (last 3000 chars):");
        console.log(stderr.substring(Math.max(0, stderr.length - 3000)));
    } else {
        console.log("No stderr output");
    }
});

// Kill after 10 seconds if still running
setTimeout(() => {
    if (!child.killed) {
        console.log("Still running after 10s, killing...");
        console.log("STDOUT so far:", stdout.substring(0, 1000));
        console.log("STDERR so far:", stderr.substring(Math.max(0, stderr.length - 2000)));
        child.kill();
    }
}, 10000);
