const crypto = require('crypto');
const fs = require('fs');
const path = "E:\\ai code web\\token_providers\\claude-app-patch\\claude-portable\\resources\\app.asar";

// Whole file hash
const fileHash = crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
console.log('Whole file SHA256:', fileHash);

// Read the asar header manually
const fd = fs.openSync(path, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, 0);
const pickleSize = sizeBuf.readUInt32LE(0);
const headerSize = sizeBuf.readUInt32LE(4);
console.log('Pickle size:', pickleSize, 'Header size:', headerSize);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 8);
const headerHash = crypto.createHash('sha256').update(headerBuf).digest('hex');
console.log('Header SHA256:', headerHash);
fs.closeSync(fd);

// Electron's block-based integrity hash
// See: electron/shell/common/asar/asar_util.cc - ValidateIntegrityOrDie
// It uses a Merkle-tree-like approach with 4MB blocks
const BLOCK_SIZE = 4 * 1024 * 1024;
const fileBuf = fs.readFileSync(path);
const blockHashes = [];
for (let i = 0; i < fileBuf.length; i += BLOCK_SIZE) {
    const block = fileBuf.subarray(i, Math.min(i + BLOCK_SIZE, fileBuf.length));
    blockHashes.push(crypto.createHash('sha256').update(block).digest());
}
console.log('Number of 4MB blocks:', blockHashes.length);

// Root hash = hash of concatenated block hashes (as binary)
const rootHash = crypto.createHash('sha256').update(Buffer.concat(blockHashes)).digest('hex');
console.log('Root hash (concat block digests):', rootHash);

// Also try: just the first block hash
console.log('First block hash:', blockHashes[0].toString('hex'));

// Try with 1MB blocks
const BLOCK_SIZE_1M = 1 * 1024 * 1024;
const blockHashes1M = [];
for (let i = 0; i < fileBuf.length; i += BLOCK_SIZE_1M) {
    const block = fileBuf.subarray(i, Math.min(i + BLOCK_SIZE_1M, fileBuf.length));
    blockHashes1M.push(crypto.createHash('sha256').update(block).digest());
}
const rootHash1M = crypto.createHash('sha256').update(Buffer.concat(blockHashes1M)).digest('hex');
console.log('Root hash (1MB blocks):', rootHash1M);

// The target hash from the error message
console.log('\nTarget (error showed):', '5a022c391d36c9109fb8bc96fd89881e8c94562bb32c25cb0cc7d02259683756');

// Also compute for the ORIGINAL asar
const origPath = "C:\\Program Files\\WindowsApps\\Claude_1.569.0.0_x64__pzs8sxrjxfjjc\\app\\resources\\app.asar";
const origBuf = fs.readFileSync(origPath);
const origFileHash = crypto.createHash('sha256').update(origBuf).digest('hex');
console.log('\nOriginal asar whole file SHA256:', origFileHash);

const origBlockHashes = [];
for (let i = 0; i < origBuf.length; i += BLOCK_SIZE) {
    const block = origBuf.subarray(i, Math.min(i + BLOCK_SIZE, origBuf.length));
    origBlockHashes.push(crypto.createHash('sha256').update(block).digest());
}
const origRootHash = crypto.createHash('sha256').update(Buffer.concat(origBlockHashes)).digest('hex');
console.log('Original root hash (4MB blocks):', origRootHash);

// Check the expected hash from the exe
console.log('\nExpected hash in exe:', 'dffcedf488d6e449b37bf3192f86e200e502df71cd897824587f6ee64fbac743');
