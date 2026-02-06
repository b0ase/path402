import { mine, MiningParams } from './pow';

async function main() {
    console.log('=== Path402 Indexer PoW Simulation ===');

    // Simulation parameters
    const params: MiningParams = {
        tick: '402',
        address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', // Mock address
        blockHeader: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f', // Genesis block
        difficulty: 4 // Start easy for demo (4 zeros)
    };

    console.log('Target params:', params);

    // Start mining
    const solution = mine(params);

    if (solution) {
        console.log('\n✅ Mining Successful!');
        console.log('Submit this BEEF transaction to the overlay network to claim your 1000 $402.');
    } else {
        console.log('\n❌ Mining Failed (timeout)');
    }
}

main().catch(console.error);
