/**
 * path402d Logger
 */

export class Logger {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(`[pathd] ${message}`);
  }

  warn(message: string): void {
    console.log(`[pathd] ⚠️  ${message}`);
  }

  error(message: string): void {
    console.error(`[pathd] ❌ ${message}`);
  }

  success(message: string): void {
    console.log(`[pathd] ✓ ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`[pathd:debug] ${message}`);
    }
  }

  table(data: Record<string, unknown>): void {
    console.table(data);
  }

  // Formatted output for status displays
  status(label: string, value: string | number, color?: 'green' | 'yellow' | 'red'): void {
    const padding = 15 - label.length;
    const spaces = ' '.repeat(Math.max(0, padding));
    let coloredValue = String(value);

    // ANSI colors
    if (color === 'green') coloredValue = `\x1b[32m${value}\x1b[0m`;
    if (color === 'yellow') coloredValue = `\x1b[33m${value}\x1b[0m`;
    if (color === 'red') coloredValue = `\x1b[31m${value}\x1b[0m`;

    console.log(`${label}:${spaces}${coloredValue}`);
  }
}
