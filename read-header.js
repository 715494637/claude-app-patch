const fs = require('fs');
const crypto = require('crypto');

const origPath = "C:\\Program Files\\WindowsApps\\Claude_1.569.0.0_x64__pzs8sxrjxfjjc\\app\\resources\\app.asar";
const patchedPath = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\resources\\app.asar";

const origBuf = fs.readFileSync(origPath);

// Find the JSON header
const jsonStartIdx = origBuf.indexOf('{"files"');
console.log("JSON starts at byte:", jsonStartIdx);

// Find end of JSON by brace matching
let depth = 0, jsonEnd = jsonStartIdx;
for (let i = jsonStartIdx; i < Math.min(origBuf.length, jsonStartIdx + 200000); i++) {
    if (origBuf[i] === 0x7B) depth++;
    else if (origBuf[i] === 0x7D) { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
}
const jsonStr = origBuf.toString('utf8', jsonStartIdx, jsonEnd);
console.log("JSON length:", jsonStr.length);

const header = JSON.parse(jsonStr);

// Find a file with integrity info
function findWithIntegrity(obj, path) {
    if (obj.integrity) return { path, integrity: obj.integrity, size: obj.size };
    if (obj.files) {
        for (const [k, v] of Object.entries(obj.files)) {
            const r = findWithIntegrity(v, path + '/' + k);
            if (r) return r;
        }
    }
    return null;
}

const sample = findWithIntegrity(header, '');
if (sample) {
    console.log("\nSample file with integrity:", sample.path);
    console.log("Integrity:", JSON.stringify(sample.integrity));
} else {
    console.log("\nNo files have integrity info in the header!");
}

// Compute whole-file hash
console.log("\nWhole file SHA256:", crypto.createHash('sha256').update(origBuf).digest('hex'));

// Compute header hash (the header section of the asar)
const headerSection = origBuf.subarray(0, jsonStartIdx + jsonStr.length);
console.log("Header section SHA256:", crypto.createHash('sha256').update(headerSection).digest('hex'));

// The expected hash
console.log("\nExpected:", "dffcedf488d6e449b37bf3192f86e200e502df71cd897824587f6ee64fbac743");

// Let's try: hash of just the header JSON string
console.log("JSON string SHA256:", crypto.createHash('sha256').update(jsonStr).digest('hex'));
console.log("JSON Buffer SHA256:", crypto.createHash('sha256').update(Buffer.from(jsonStr, 'utf8')).digest('hex'));

// Try: hash of the header as stored in the pickle (with length prefix and padding)
// Pickle format: [4 bytes pickle_size][4 bytes data_size][4 bytes str_len][str][padding]
const dataSize = origBuf.readUInt32LE(4);
console.log("\nData size from pickle:", dataSize);
const fullPickle = origBuf.subarray(0, 8 + dataSize);
console.log("Full pickle SHA256:", crypto.createHash('sha256').update(fullPickle).digest('hex'));

// Just the data portion
const dataPortion = origBuf.subarray(8, 8 + dataSize);
console.log("Data portion SHA256:", crypto.createHash('sha256').update(dataPortion).digest('hex'));

// Compute patched asar hash for comparison
const patchedBuf = fs.readFileSync(patchedPath);
console.log("\nPatched whole file SHA256:", crypto.createHash('sha256').update(patchedBuf).digest('hex'));
