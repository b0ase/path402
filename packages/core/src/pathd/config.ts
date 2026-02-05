/**
 * path402d Configuration
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';

export interface PathDConfig {
  port: number;
  dataDir: string;
  bsvNode: string;
  powEnabled: boolean;
  powThreads: number;
  walletKey?: string;
  verbose: boolean;
}

const DEFAULT_CONFIG: PathDConfig = {
  port: 8402,
  dataDir: join(homedir(), '.pathd'),
  bsvNode: 'https://api.whatsonchain.com/v1/bsv/main',
  powEnabled: false,
  powThreads: 4,
  verbose: false,
};

export class Config implements PathDConfig {
  port: number;
  dataDir: string;
  bsvNode: string;
  powEnabled: boolean;
  powThreads: number;
  walletKey?: string;
  verbose: boolean;
  configPath: string;

  constructor(options: Record<string, string | boolean> = {}) {
    // Start with defaults
    this.port = DEFAULT_CONFIG.port;
    this.dataDir = DEFAULT_CONFIG.dataDir;
    this.bsvNode = DEFAULT_CONFIG.bsvNode;
    this.powEnabled = DEFAULT_CONFIG.powEnabled;
    this.powThreads = DEFAULT_CONFIG.powThreads;
    this.verbose = DEFAULT_CONFIG.verbose;

    // Set config path
    this.configPath = join(this.dataDir, 'config.json');

    // Load from environment
    if (process.env.PATHD_PORT) this.port = parseInt(process.env.PATHD_PORT);
    if (process.env.PATHD_DATA_DIR) this.dataDir = process.env.PATHD_DATA_DIR;
    if (process.env.PATHD_BSV_NODE) this.bsvNode = process.env.PATHD_BSV_NODE;
    if (process.env.PATHD_WALLET_KEY) this.walletKey = process.env.PATHD_WALLET_KEY;
    if (process.env.PATHD_POW_ENABLED) this.powEnabled = process.env.PATHD_POW_ENABLED === 'true';
    if (process.env.PATHD_POW_THREADS) this.powThreads = parseInt(process.env.PATHD_POW_THREADS);

    // Load from config file
    this.loadConfigFile();

    // Override with CLI options
    if (options.port) this.port = parseInt(options.port as string);
    if (options.data) this.dataDir = options.data as string;
    if (options.bsv) this.bsvNode = options.bsv as string;
    if (options.verbose) this.verbose = true;

    // Ensure data directory exists
    this.ensureDataDir();
  }

  private loadConfigFile(): void {
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, 'utf-8');
        const fileConfig = JSON.parse(content);

        if (fileConfig.port) this.port = fileConfig.port;
        if (fileConfig.dataDir) this.dataDir = fileConfig.dataDir;
        if (fileConfig.bsvNode) this.bsvNode = fileConfig.bsvNode;
        if (fileConfig.powEnabled !== undefined) this.powEnabled = fileConfig.powEnabled;
        if (fileConfig.powThreads) this.powThreads = fileConfig.powThreads;
        if (fileConfig.walletKey) this.walletKey = fileConfig.walletKey;
      } catch {
        // Invalid config file, use defaults
      }
    }
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  save(): void {
    const config = {
      port: this.port,
      bsvNode: this.bsvNode,
      powEnabled: this.powEnabled,
      powThreads: this.powThreads,
    };
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}
