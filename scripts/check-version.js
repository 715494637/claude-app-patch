/**
 * Check Claude Desktop latest version from winget-pkgs GitHub repo.
 * Outputs: LATEST_VERSION, DOWNLOAD_URL, SHA256, HAS_UPDATE (true/false)
 *
 * Usage:
 *   node check-version.js                    # Compare with scripts/version.txt
 *   node check-version.js --current 1.569.0  # Compare with given version
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const WINGET_API = 'https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/a/Anthropic/Claude';
const WINGET_RAW = 'https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/a/Anthropic/Claude';

function fetch(url) {
    return new Promise((resolve, reject) => {
        const opts = { headers: { 'User-Agent': 'claude-app-patch/1.0' } };
        https.get(url, opts, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetch(res.headers.location).then(resolve, reject);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                else resolve(data);
            });
        }).on('error', reject);
    });
}

function semverCompare(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

async function main() {
    // Get current version
    const args = process.argv.slice(2);
    let currentVersion;
    const cvIdx = args.indexOf('--current');
    if (cvIdx >= 0 && args[cvIdx + 1]) {
        currentVersion = args[cvIdx + 1];
    } else {
        const vFile = path.resolve(__dirname, 'version.txt');
        currentVersion = fs.existsSync(vFile) ? fs.readFileSync(vFile, 'utf-8').trim() : '0.0.0';
    }

    console.log(`Current version: ${currentVersion}`);

    // List all versions from winget-pkgs
    const listing = JSON.parse(await fetch(WINGET_API));
    const versions = listing
        .filter(e => e.type === 'dir' && /^\d/.test(e.name))
        .map(e => e.name)
        .sort(semverCompare);

    const latestVersion = versions[versions.length - 1];
    console.log(`Latest version:  ${latestVersion}`);

    const hasUpdate = semverCompare(latestVersion, currentVersion) > 0;
    console.log(`Has update:      ${hasUpdate}`);

    // Get download URL and SHA from installer manifest
    let downloadUrl = '', sha256 = '';
    try {
        const manifest = await fetch(`${WINGET_RAW}/${latestVersion}/Anthropic.Claude.installer.yaml`);
        const urlMatch = manifest.match(/InstallerUrl:\s*(https:\/\/downloads\.claude\.ai\/releases\/win32\/x64\/[^\s]+)/);
        const shaMatch = manifest.match(/InstallerSha256:\s*([A-Fa-f0-9]{64})/);
        if (urlMatch) downloadUrl = urlMatch[1];
        if (shaMatch) sha256 = shaMatch[1];
    } catch (e) {
        console.error('Failed to fetch installer manifest:', e.message);
    }

    console.log(`Download URL:    ${downloadUrl}`);
    console.log(`SHA256:          ${sha256}`);

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
        const out = [
            `LATEST_VERSION=${latestVersion}`,
            `DOWNLOAD_URL=${downloadUrl}`,
            `SHA256=${sha256}`,
            `HAS_UPDATE=${hasUpdate}`,
        ].join('\n') + '\n';
        fs.appendFileSync(process.env.GITHUB_OUTPUT, out);
    }
}

main().catch(e => { console.error(e.message); process.exit(1); });
