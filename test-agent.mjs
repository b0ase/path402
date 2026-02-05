import { runAgent } from './packages/core/dist/client/agent.js';
import process from 'process';
import { mkdirSync } from 'fs';

console.log("Starting Test Agent 2...");

const dataDir = process.env.PATHD_DATA_DIR || './.pathd-test';

try {
    mkdirSync(dataDir, { recursive: true });
} catch (e) { }

const config = {
    gossipPort: 4030,
    guiPort: 4031,
    dataDir: dataDir,
    speculationEnabled: true
};

runAgent(config).catch(err => {
    console.error("Failed to start agent:", err);
    process.exit(1);
});
