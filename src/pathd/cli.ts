#!/usr/bin/env node
/**
 * $pathd CLI - The Path 402 Token Protocol Daemon
 *
 * Run a $402 network node: index tokens, serve content, earn rewards.
 *
 * Usage:
 *   pathd start           Start the daemon
 *   pathd status          Check daemon status
 *   pathd stop            Stop the daemon
 *   pathd config          Show configuration
 *   pathd index           Manually trigger indexing
 *   pathd serve           Start serving content
 *   pathd mine            Start PoW20 mining (requires stake)
 */

import { Daemon } from './daemon.js';
import { Config } from './config.js';
import { Logger } from './logger.js';

const VERSION = '0.1.0';

const HELP = `
$pathd v${VERSION} - The Path 402 Token Protocol Daemon

USAGE:
  pathd <command> [options]

COMMANDS:
  start           Start the $pathd daemon
  stop            Stop the running daemon
  status          Show daemon status
  config          Show current configuration
  index           Trigger manual indexing
  serve           Start HTTP content server
  mine            Start PoW20 mining (experimental)
  version         Show version

OPTIONS:
  --port <n>      HTTP server port (default: 8402)
  --data <dir>    Data directory (default: ~/.pathd)
  --bsv <url>     BSV node URL (default: https://api.whatsonchain.com)
  --verbose       Enable verbose logging
  --help          Show this help

EXAMPLES:
  pathd start                    Start daemon with defaults
  pathd start --port 9402        Start on custom port
  pathd status                   Check if daemon is running
  pathd config                   View configuration

WHY RUN $pathd?
  • INDEX tokens on the $402 network
  • SERVE content to verified token holders
  • EARN $402 rewards via PoW20 mining
  • BECOME a visible, accountable network participant

PoW20 forces operators into the open. Big nodes can't hide.
Big nodes must identify themselves. This is by design.

More info: https://path402.com/docs/PATHD_ARCHITECTURE
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
      console.log(`$pathd v${VERSION}`);
      break;

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "pathd --help" for usage.');
      process.exit(1);
  }
}

async function startDaemon(config: Config, logger: Logger) {
  logger.info('Starting $pathd daemon...');
  logger.info(`  Port: ${config.port}`);
  logger.info(`  Data: ${config.dataDir}`);
  logger.info(`  BSV:  ${config.bsvNode}`);

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
  logger.info('Stopping $pathd daemon...');
  // TODO: Send stop signal to running daemon via PID file or socket
  logger.warn('Stop command not yet implemented - kill the process manually');
}

async function showStatus(config: Config, logger: Logger) {
  logger.info('$pathd Status');
  logger.info('─'.repeat(40));

  // Check if daemon is running
  try {
    const response = await fetch(`http://localhost:${config.port}/health`);
    if (response.ok) {
      const data = await response.json();
      logger.info(`Status:        RUNNING`);
      logger.info(`Indexed Block: ${data.indexed_block || 'N/A'}`);
      logger.info(`Tokens:        ${data.tokens_tracked || 0}`);
      logger.info(`Uptime:        ${formatUptime(data.uptime_seconds || 0)}`);
    } else {
      logger.info('Status: NOT RUNNING');
    }
  } catch {
    logger.info('Status: NOT RUNNING');
    logger.info(`(No daemon found on port ${config.port})`);
  }
}

function showConfig(config: Config, logger: Logger) {
  logger.info('$pathd Configuration');
  logger.info('─'.repeat(40));
  logger.info(`Port:          ${config.port}`);
  logger.info(`Data Dir:      ${config.dataDir}`);
  logger.info(`BSV Node:      ${config.bsvNode}`);
  logger.info(`PoW Enabled:   ${config.powEnabled}`);
  logger.info(`PoW Threads:   ${config.powThreads}`);
  logger.info(`─'.repeat(40)`);
  logger.info(`Config file:   ${config.configPath}`);
}

async function triggerIndex(config: Config, logger: Logger) {
  logger.info('Triggering manual index...');
  try {
    const response = await fetch(`http://localhost:${config.port}/api/index`, {
      method: 'POST'
    });
    if (response.ok) {
      logger.info('Indexing triggered successfully');
    } else {
      logger.error('Failed to trigger indexing');
    }
  } catch {
    logger.error(`Cannot connect to daemon on port ${config.port}`);
    logger.error('Is $pathd running? Try: pathd start');
  }
}

async function startServer(config: Config, logger: Logger) {
  logger.info('Starting content server only...');
  const daemon = new Daemon(config, logger);
  await daemon.startServer();
}

async function startMining(config: Config, logger: Logger) {
  logger.warn('⚠️  PoW20 mining is experimental');
  logger.info('');
  logger.info('WHY PoW?');
  logger.info('  Not just to reward work - to force operators into the open.');
  logger.info('  Computational cost → Capital investment → Scale → Visibility');
  logger.info('  Big nodes can\'t hide. Big nodes must identify themselves.');
  logger.info('');
  logger.info('Starting PoW20 miner...');

  const daemon = new Daemon(config, logger);
  await daemon.startMining();
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
