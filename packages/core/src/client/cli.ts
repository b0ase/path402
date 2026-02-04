#!/usr/bin/env node

/**
 * $402 Pathd Client CLI
 *
 * Autonomous agent for the $402 protocol.
 * Fully decentralized - no central server dependency.
 *
 * Usage:
 *   pathd-client                    # Start with defaults
 *   pathd-client --port 4020        # Custom gossip port
 *   pathd-client --speculate        # Enable speculation
 *   pathd-client --auto-acquire     # Enable auto-acquisition
 */

import { Path402Agent, runAgent, AgentConfig } from './agent.js';
import { STRATEGIES } from '../speculation/engine.js';

// ── Parse CLI Arguments ────────────────────────────────────────────

function parseArgs(): AgentConfig {
  const args = process.argv.slice(2);
  const config: AgentConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--port':
      case '-p':
        config.gossipPort = parseInt(args[++i]) || 4020;
        break;

      case '--data-dir':
      case '-d':
        config.dataDir = args[++i];
        break;

      case '--bootstrap':
      case '-b':
        config.bootstrapPeers = config.bootstrapPeers || [];
        config.bootstrapPeers.push(args[++i]);
        break;

      case '--speculate':
      case '-s':
        config.speculationEnabled = true;
        break;

      case '--auto-acquire':
      case '-a':
        config.autoAcquire = true;
        break;

      case '--budget':
        config.speculationBudget = parseInt(args[++i]) || 100000;
        break;

      case '--strategy':
        config.speculationStrategy = args[++i];
        break;

      case '--ai-provider':
        config.aiProvider = args[++i] as 'claude' | 'openai' | 'ollama';
        break;

      case '--ai-key':
        config.aiApiKey = args[++i];
        break;

      case '--ai-model':
        config.aiModel = args[++i];
        break;

      case '--gui':
      case '-g':
        config.guiEnabled = true;
        break;

      case '--no-gui':
        config.guiEnabled = false;
        break;

      case '--gui-port':
        config.guiPort = parseInt(args[++i]) || 4021;
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);

      case '--version':
      case '-v':
        console.log('pathd-client v0.1.0');
        process.exit(0);

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
$402 Pathd Client - Autonomous Agent

USAGE:
  pathd-client [OPTIONS]

OPTIONS:
  -p, --port <port>         Gossip port (default: 4020)
  -d, --data-dir <dir>      Data directory (default: ~/.pathd)
  -b, --bootstrap <peer>    Bootstrap peer (host:port), can repeat

  -s, --speculate           Enable AI-powered speculation
  -a, --auto-acquire        Enable automatic token acquisition
  --budget <sats>           Speculation budget in satoshis (default: 100000)
  --strategy <name>         Speculation strategy: ${Object.keys(STRATEGIES).join(', ')}

  --ai-provider <name>      AI provider: claude, openai, ollama (default: claude)
  --ai-key <key>            AI API key (or use ANTHROPIC_API_KEY env var)
  --ai-model <model>        AI model (default: claude-sonnet-4-20250514)

  -g, --gui                 Enable web GUI dashboard (default: enabled)
  --no-gui                  Disable web GUI dashboard
  --gui-port <port>         GUI port (default: 4021)

  -h, --help                Show this help
  -v, --version             Show version

ENVIRONMENT VARIABLES:
  ANTHROPIC_API_KEY         Claude API key
  OPENAI_API_KEY            OpenAI API key
  PATHD_DATA_DIR            Default data directory

EXAMPLES:
  # Start basic node
  pathd-client

  # Connect to specific bootstrap peer
  pathd-client -b pathd.b0ase.com:4020

  # Enable speculation with auto-acquire
  pathd-client --speculate --auto-acquire --budget 50000

  # Use aggressive strategy
  pathd-client -s -a --strategy aggressive

  # Run with GUI on custom port
  pathd-client --gui --gui-port 8080

  # Run headless (no GUI)
  pathd-client --no-gui

STRATEGIES:
  conservative    Low risk, high confidence threshold
  early_adopter   Balanced risk, targets low-supply tokens
  aggressive      High risk, wide coverage
`);
}

// ── Interactive Mode ───────────────────────────────────────────────

async function startInteractive(agent: Path402Agent): Promise<void> {
  const readline = await import('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'pathd> '
  });

  console.log('\n$402 Pathd Client - Interactive Mode');
  console.log('Type "help" for commands, "quit" to exit\n');

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    const [cmd, ...args] = input.split(/\s+/);

    try {
      switch (cmd) {
        case 'status':
          const status = agent.getStatus();
          console.log(JSON.stringify(status, null, 2));
          break;

        case 'peers':
          console.log(`Connected peers: ${agent.getStatus().peers.connected}`);
          break;

        case 'connect':
          if (args.length < 1) {
            console.log('Usage: connect <host:port>');
          } else {
            const [host, portStr] = args[0].split(':');
            const port = parseInt(portStr) || 4020;
            await agent.connectToPeer(host, port);
            console.log(`Connected to ${args[0]}`);
          }
          break;

        case 'tokens':
          const tokenStatus = agent.getStatus();
          console.log(`Known: ${tokenStatus.tokens.known}, Held: ${tokenStatus.tokens.held}`);
          break;

        case 'portfolio':
          const portfolio = agent.getStatus().portfolio;
          console.log(`Value: ${portfolio.totalValue} SAT`);
          console.log(`Spent: ${portfolio.totalSpent} SAT`);
          console.log(`Revenue: ${portfolio.totalRevenue} SAT`);
          console.log(`P&L: ${portfolio.pnl} SAT`);
          break;

        case 'request':
          if (args.length < 1) {
            console.log('Usage: request <token_id>');
          } else {
            agent.requestToken(args[0]);
            console.log(`Requested: ${args[0]}`);
          }
          break;

        case 'announce':
          if (args.length < 1) {
            console.log('Usage: announce <token_id>');
          } else {
            agent.announceToken(args[0]);
            console.log(`Announced: ${args[0]}`);
          }
          break;

        case 'evaluate':
          if (args.length < 1) {
            console.log('Usage: evaluate <token_id>');
          } else {
            console.log('Evaluating...');
            const evaluation = await agent.evaluateToken(args[0]);
            if (evaluation) {
              console.log(`Score: ${evaluation.score}/100`);
              console.log(`Confidence: ${Math.round(evaluation.confidence * 100)}%`);
              console.log(`Recommendation: ${evaluation.recommendation}`);
              console.log(`Reasoning: ${evaluation.reasoning}`);
            } else {
              console.log('Evaluation failed');
            }
          }
          break;

        case 'scan':
          console.log('Scanning for opportunities...');
          const opportunities = await agent.scanOpportunities();
          console.log(`Found ${opportunities.length} opportunities`);
          for (const opp of opportunities.slice(0, 5)) {
            console.log(`  ${opp.tokenId}: score=${opp.score}, rec=${opp.recommendation}`);
          }
          break;

        case 'speculate':
          if (args[0] === 'on') {
            agent.setSpeculation(true);
            console.log('Speculation enabled');
          } else if (args[0] === 'off') {
            agent.setSpeculation(false);
            console.log('Speculation disabled');
          } else {
            console.log('Usage: speculate <on|off>');
          }
          break;

        case 'auto':
          if (args[0] === 'on') {
            agent.setAutoAcquire(true);
            console.log('Auto-acquire enabled');
          } else if (args[0] === 'off') {
            agent.setAutoAcquire(false);
            console.log('Auto-acquire disabled');
          } else {
            console.log('Usage: auto <on|off>');
          }
          break;

        case 'budget':
          if (args.length < 1) {
            console.log(`Current budget: ${agent.getStatus().speculation.budget} SAT`);
          } else {
            agent.setBudget(parseInt(args[0]));
            console.log(`Budget set to ${args[0]} SAT`);
          }
          break;

        case 'strategy':
          if (args.length < 1) {
            console.log(`Current: ${agent.getStatus().speculation.strategy}`);
            console.log(`Available: ${agent.getStrategies().join(', ')}`);
          } else {
            agent.setStrategy(args[0]);
            console.log(`Strategy set to ${args[0]}`);
          }
          break;

        case 'help':
          console.log(`
Commands:
  status              Show full status
  peers               Show peer count
  connect <host:port> Connect to peer
  tokens              Show token counts
  portfolio           Show portfolio summary
  request <token_id>  Request token data
  announce <token_id> Announce token
  evaluate <token_id> AI evaluation
  scan                Scan for opportunities
  speculate <on|off>  Toggle speculation
  auto <on|off>       Toggle auto-acquire
  budget [sats]       Get/set budget
  strategy [name]     Get/set strategy
  quit                Exit
`);
          break;

        case 'quit':
        case 'exit':
          await agent.stop();
          process.exit(0);

        case '':
          break;

        default:
          console.log(`Unknown command: ${cmd}`);
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    await agent.stop();
    process.exit(0);
  });
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  console.log('');
  console.log('\x1b[36m  ┌─────────────────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m                                                           \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m██████╗ \x1b[36m██╗  ██╗ ██████╗ ██████╗ \x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m██╔════╝\x1b[36m ██║  ██║██╔═████╗╚════██╗\x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m╚█████╗ \x1b[36m███████║██║██╔██║ █████╔╝\x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m ╚═══██╗\x1b[36m╚════██║████╔╝██║██╔═══╝ \x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m██████╔╝\x1b[36m     ██║╚██████╔╝███████╗\x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[32m╚═════╝ \x1b[36m     ╚═╝ ╚═════╝ ╚══════╝\x1b[0m                    \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m                                                           \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[90mPath402 Client · Decentralized · Autonomous\x1b[0m              \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m   \x1b[90mContent Speculation Agent with Multi-Chain Wallets\x1b[0m       \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  │\x1b[0m                                                           \x1b[36m│\x1b[0m');
  console.log('\x1b[36m  └─────────────────────────────────────────────────────────┘\x1b[0m');
  console.log('');

  try {
    const agent = await runAgent(config);

    // Enter interactive mode if TTY
    if (process.stdin.isTTY) {
      await startInteractive(agent);
    } else {
      // Non-interactive: just run
      console.log('[Agent] Running in non-interactive mode. Send SIGINT to stop.');
    }
  } catch (error) {
    console.error('Failed to start agent:', (error as Error).message);
    process.exit(1);
  }
}

main();
