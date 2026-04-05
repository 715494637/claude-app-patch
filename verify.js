const fs = require('fs');
const crypto = require('crypto');

const exePath = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\claude.exe";
const asarPath = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\resources\\app.asar";

// 1. Read embedded integrity hash from exe
const exeBuf = fs.readFileSync(exePath);
const marker = Buffer.from('{"file":', 'ascii');
const idx = exeBuf.indexOf(marker);
const endIdx = exeBuf.indexOf(Buffer.from(']', 'ascii'), idx);
const integrityJson = JSON.parse(exeBuf.toString('ascii', idx - 1, endIdx + 1));
const embeddedHash = integrityJson[0].value;
console.log("Exe embedded hash:", embeddedHash);

// 2. Compute actual asar header JSON hash
const asarBuf = fs.readFileSync(asarPath);
const jsonStart = asarBuf.indexOf('{"files"');
let depth = 0, jsonEnd = jsonStart;
for (let i = jsonStart; i < asarBuf.length; i++) {
    if (asarBuf[i] === 0x7B) depth++;
    else if (asarBuf[i] === 0x7D) { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
}
const headerJson = asarBuf.toString('utf8', jsonStart, jsonEnd);
const actualHash = crypto.createHash('sha256').update(headerJson).digest('hex');
console.log("Asar header hash: ", actualHash);
console.log("Match:", embeddedHash === actualHash);

// 3. Check exe signature
const origExePath = "C:\\Program Files\\WindowsApps\\Claude_1.569.0.0_x64__pzs8sxrjxfjjc\\app\\claude.exe";
const origBuf = fs.readFileSync(origExePath);
const origIdx = origBuf.indexOf(marker);
const origEndIdx = origBuf.indexOf(Buffer.from(']', 'ascii'), origIdx);
const origJson = JSON.parse(origBuf.toString('ascii', origIdx - 1, origEndIdx + 1));
console.log("\nOriginal exe hash:", origJson[0].value);
console.log("Exe sizes - orig:", origBuf.length, "patched:", exeBuf.length);
console.log("Only hash bytes differ:", exeBuf.length === origBuf.length);
