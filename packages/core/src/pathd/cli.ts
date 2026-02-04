#!/usr/bin/env node
/**
 * path402d CLI - The $402 Protocol Daemon
 *
 * Run a $402 network node: index tokens, serve content, earn rewards.
 *
 * Usage:
 *   path402d start           Start the daemon
 *   path402d status          Check daemon status
 *   path402d stop            Stop the daemon
 *   path402d config          Show configuration
 *   path402d index           Manually trigger indexing
 *   path402d serve           Start serving content
 */

import { Daemon } from './daemon.js';
import { Config } from './config.js';
import { Logger } from './logger.js';

const VERSION = '1.0.0';

// ANSI color codes - white/lightblue theme
const RESET = '\x1b[0m';
const WHITE = '\x1b[97m';
const CYAN = '\x1b[96m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const BANNER = `
${CYAN}╔═══════════════════════════════════════════════════════════════╗${RESET}
${CYAN}║${RESET}                                                               ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD}  ██████╗  ██╗  ██╗ ██████╗  ██████╗${RESET}                       ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD} ██╔════╝  ██║  ██║ ██╔═══██╗╚════██╗${RESET}                      ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD} ╚█████╗   ███████║ ██║   ██║ █████╔╝${RESET}                      ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD}  ╚═══██╗  ╚════██║ ██║   ██║██╔═══╝${RESET}                       ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD} ██████╔╝       ██║ ╚██████╔╝███████╗${RESET}                      ${CYAN}║${RESET}
${CYAN}║${RESET}   ${WHITE}${BOLD} ╚═════╝        ╚═╝  ╚═════╝ ╚══════╝${RESET}                      ${CYAN}║${RESET}
${CYAN}║${RESET}                                                               ${CYAN}║${RESET}
${CYAN}║${RESET}   ${DIM}path402d v${VERSION}${RESET}  ${CYAN}The $402 Protocol Daemon${RESET}                  ${CYAN}║${RESET}
${CYAN}║${RESET}   ${DIM}Tokenized Attention • Time-Based Access${RESET}                    ${CYAN}║${RESET}
${CYAN}║${RESET}                                                               ${CYAN}║${RESET}
${CYAN}╚═══════════════════════════════════════════════════════════════╝${RESET}
`;

const HELP = `${BANNER}
${WHITE}${BOLD}USAGE${RESET}
  ${CYAN}path402d${RESET} <command> [options]

${WHITE}${BOLD}COMMANDS${RESET}
  ${CYAN}start${RESET}           Start the path402d daemon
  ${CYAN}stop${RESET}            Stop the running daemon
  ${CYAN}status${RESET}          Show daemon status
  ${CYAN}config${RESET}          Show current configuration
  ${CYAN}index${RESET}           Trigger manual indexing
  ${CYAN}serve${RESET}           Start HTTP content server
  ${CYAN}version${RESET}         Show version

${WHITE}${BOLD}OPTIONS${RESET}
  ${CYAN}--port${RESET} <n>      HTTP server port ${DIM}(default: 8402)${RESET}
  ${CYAN}--data${RESET} <dir>    Data directory ${DIM}(default: ~/.path402d)${RESET}
  ${CYAN}--bsv${RESET} <url>     BSV node URL ${DIM}(default: https://api.whatsonchain.com)${RESET}
  ${CYAN}--verbose${RESET}       Enable verbose logging
  ${CYAN}--help${RESET}          Show this help

${WHITE}${BOLD}EXAMPLES${RESET}
  ${DIM}$${RESET} path402d start                    ${DIM}# Start daemon with defaults${RESET}
  ${DIM}$${RESET} path402d start --port 9402        ${DIM}# Start on custom port${RESET}
  ${DIM}$${RESET} path402d status                   ${DIM}# Check if daemon is running${RESET}
  ${DIM}$${RESET} path402d config                   ${DIM}# View configuration${RESET}

${WHITE}${BOLD}WHY RUN path402d?${RESET}
  ${CYAN}•${RESET} ${WHITE}INDEX${RESET}  tokens on the $402 network
  ${CYAN}•${RESET} ${WHITE}SERVE${RESET}  content to verified token holders
  ${CYAN}•${RESET} ${WHITE}EARN${RESET}   $402 rewards via Proof of Serve
  ${CYAN}•${RESET} ${WHITE}MINT${RESET}   personal tokens for attention markets

${DIM}Proof of Serve rewards actual contribution - not wasteful hashing.
Nodes earn by serving, relaying, and indexing.${RESET}

${DIM}More info:${RESET} ${CYAN}https://path402.com/whitepaper${RESET}
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse options
  const options: Record<string, string | boolean> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  const logger = new Logger(options.verbose === true);
  const config = new Config(options);

  switch (command) {
    case 'start':
      await startDaemon(config, logger);
      break;

    case 'stop':
      await stopDaemon(config, logger);
      break;

    case 'status':
      await showStatus(config, logger);
      break;

    case 'config':
      showConfig(config, logger);
      break;

    case 'index':
      await triggerIndex(config, logger);
      break;

    case 'serve':
      await startServer(config, logger);
      break;

    case 'mine':
      await startMining(config, logger);
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log(`${CYAN}path402d${RESET} v${VERSION}`);
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(`Run "${CYAN}path402d --help${RESET}" for usage.`);
      process.exit(1);
  }
}

async function startDaemon(config: Config, logger: Logger) {
  console.log(BANNER);
  logger.info(`${CYAN}Starting path402d daemon...${RESET}`);
  logger.info(`  ${WHITE}Port:${RESET} ${config.port}`);
  logger.info(`  ${WHITE}Data:${RESET} ${config.dataDir}`);
  logger.info(`  ${WHITE}BSV:${RESET}  ${config.bsvNode}`);

  const daemon = new Daemon(config, logger);

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

async function stopDaemon(config: Config, logger: Logger) {
  logger.info(`${CYAN}Stopping path402d daemon...${RESET}`);
  // TODO: Send stop signal to running daemon via PID file or socket
  logger.warn('Stop command not yet implemented - kill the process manually');
}

async function showStatus(config: Config, logger: Logger) {
  console.log(`\n${CYAN}path402d Status${RESET}`);
  console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);

  // Check if daemon is running
  try {
    const response = await fetch(`http://localhost:${config.port}/health`);
    if (response.ok) {
      const data = await response.json();
      console.log(`  ${WHITE}Status:${RESET}        ${CYAN}● RUNNING${RESET}`);
      console.log(`  ${WHITE}Indexed Block:${RESET} ${data.indexed_block || 'N/A'}`);
      console.log(`  ${WHITE}Tokens:${RESET}        ${data.tokens_tracked || 0}`);
      console.log(`  ${WHITE}Uptime:${RESET}        ${formatUptime(data.uptime_seconds || 0)}`);
    } else {
      console.log(`  ${WHITE}Status:${RESET}        ${DIM}○ NOT RUNNING${RESET}`);
    }
  } catch {
    console.log(`  ${WHITE}Status:${RESET}        ${DIM}○ NOT RUNNING${RESET}`);
    console.log(`  ${DIM}(No daemon found on port ${config.port})${RESET}`);
  }
  console.log(`${CYAN}${'─'.repeat(50)}${RESET}\n`);
}

function showConfig(config: Config, logger: Logger) {
  console.log(`\n${CYAN}path402d Configuration${RESET}`);
  console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);
  console.log(`  ${WHITE}Port:${RESET}          ${config.port}`);
  console.log(`  ${WHITE}Data Dir:${RESET}      ${config.dataDir}`);
  console.log(`  ${WHITE}BSV Node:${RESET}      ${config.bsvNode}`);
  console.log(`  ${WHITE}Serve Enabled:${RESET} ${config.powEnabled ? 'Yes' : 'No'}`);
  console.log(`${CYAN}${'─'.repeat(50)}${RESET}`);
  console.log(`  ${DIM}Config file:${RESET}   ${config.configPath}`);
  console.log('');
}

async function triggerIndex(config: Config, logger: Logger) {
  logger.info(`${CYAN}Triggering manual index...${RESET}`);
  try {
    const response = await fetch(`http://localhost:${config.port}/api/index`, {
      method: 'POST'
    });
    if (response.ok) {
      logger.info(`${WHITE}Indexing triggered successfully${RESET}`);
    } else {
      logger.error('Failed to trigger indexing');
    }
  } catch {
    logger.error(`Cannot connect to daemon on port ${config.port}`);
    logger.error(`Is path402d running? Try: ${CYAN}path402d start${RESET}`);
  }
}

async function startServer(config: Config, logger: Logger) {
  console.log(BANNER);
  logger.info(`${CYAN}Starting content server only...${RESET}`);
  const daemon = new Daemon(config, logger);
  await daemon.startServer();
}

async function startMining(config: Config, logger: Logger) {
  console.log(`
${WHITE}${BOLD}Proof of Serve${RESET}

${CYAN}The $402 network uses Proof of Serve, not Proof of Work.${RESET}

Rewards are earned by actual contribution:
  ${CYAN}•${RESET} ${WHITE}SERVE${RESET}    - Deliver content to requesters
  ${CYAN}•${RESET} ${WHITE}RELAY${RESET}    - Forward gossip messages
  ${CYAN}•${RESET} ${WHITE}INDEX${RESET}    - Maintain accurate token indexes
  ${CYAN}•${RESET} ${WHITE}VALIDATE${RESET} - Verify transactions

Your reward = (your_serves / total_serves) × daily_pool

${DIM}This creates healthy incentives without centralization pressure.
No ASICs. No energy waste. Just useful work.${RESET}

To start earning: ${CYAN}path402d start${RESET}
`);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
