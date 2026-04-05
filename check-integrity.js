const fs = require('fs');
const crypto = require('crypto');

const patchedPath = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\resources\\app.asar";
const patchedBuf = fs.readFileSync(patchedPath);

// Find the JSON header
const jsonStartIdx = patchedBuf.indexOf('{"files"');
let depth = 0, jsonEnd = jsonStartIdx;
for (let i = jsonStartIdx; i < Math.min(patchedBuf.length, jsonStartIdx + 200000); i++) {
    if (patchedBuf[i] === 0x7B) depth++;
    else if (patchedBuf[i] === 0x7D) { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
}
const jsonStr = patchedBuf.toString('utf8', jsonStartIdx, jsonEnd);
const header = JSON.parse(jsonStr);

console.log("=== Patched asar header JSON SHA256 ===");
console.log(crypto.createHash('sha256').update(jsonStr).digest('hex'));

// Find index.js integrity info
const indexJs = header.files['.vite'].files['build'].files['index.js'];
console.log("\nindex.js header info:", JSON.stringify(indexJs));

// Read the actual index.js content from the asar
const offset = parseInt(indexJs.offset);
const size = indexJs.size;
const content = patchedBuf.subarray(jsonStartIdx + jsonStr.length + (16 - jsonStartIdx) + offset, jsonStartIdx + jsonStr.length + (16 - jsonStartIdx) + offset + size);

// Actually, the data starts after the header section
// Header section = 8 bytes (pickle header) + dataSize bytes
const dataSize = patchedBuf.readUInt32LE(4);
const dataStart = 8 + dataSize;
console.log("Data starts at:", dataStart);

const fileContent = patchedBuf.subarray(dataStart + offset, dataStart + offset + size);
console.log("File content first 50 chars:", fileContent.toString('utf8', 0, 50));

// Compute the actual hash of the file content
const BLOCK_SIZE = 4194304; // 4MB
const actualHash = crypto.createHash('sha256').update(fileContent).digest('hex');
console.log("\nActual index.js SHA256:", actualHash);
console.log("Header says:", indexJs.integrity.hash);
console.log("Match:", actualHash === indexJs.integrity.hash);

// Compute block hashes
const blocks = [];
for (let i = 0; i < fileContent.length; i += BLOCK_SIZE) {
    const block = fileContent.subarray(i, Math.min(i + BLOCK_SIZE, fileContent.length));
    blocks.push(crypto.createHash('sha256').update(block).digest('hex'));
}
console.log("\nActual blocks:", blocks);
console.log("Header blocks:", indexJs.integrity.blocks);
