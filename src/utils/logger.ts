import chalk from 'chalk';

export interface LoggerOptions {
  timestamp?: boolean;
  prefix?: string;
  box?: boolean;
  indent?: number;
}

class Logger {
  private getTimestamp(): string {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private formatMessage(message: string, options: LoggerOptions = {}): string {
    let formatted = message;
    
    if (options.indent) {
      const spaces = ' '.repeat(options.indent);
      formatted = formatted.split('\n').map(line => spaces + line).join('\n');
    }

    if (options.prefix) {
      formatted = `${options.prefix} ${formatted}`;
    }

    if (options.timestamp) {
      formatted = `${chalk.gray(`[${this.getTimestamp()}]`)} ${formatted}`;
    }

    return formatted;
  }

  // General logging methods
  info(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { ...options, prefix: chalk.blue('ℹ') });
    console.log(formatted);
  }

  success(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { ...options, prefix: chalk.green('✅') });
    console.log(formatted);
  }

  warning(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { ...options, prefix: chalk.yellow('⚠️') });
    console.log(formatted);
  }

  error(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { ...options, prefix: chalk.red('❌') });
    console.error(formatted);
  }

  debug(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { ...options, prefix: chalk.gray('🔧') });
    console.log(formatted);
  }

  // Special green-themed embedding methods
  embedding(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgGreen.black(' 🌱 EMBEDDING ') 
    });
    console.log(formatted);
  }

  embeddingProgress(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.green('⚡') 
    });
    console.log(formatted);
  }

  embeddingSuccess(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgGreen.black(' ✨ EMBEDDED ') 
    });
    console.log(formatted);
  }

  embeddingStats(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.green('📊') 
    });
    console.log(formatted);
  }

  // Vector operations (also green-themed)
  vector(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.green('🔗') 
    });
    console.log(formatted);
  }

  rag(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgGreen.black(' 🧠 RAG ') 
    });
    console.log(formatted);
  }

  // Tool execution methods
  tool(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.cyan('🔧') 
    });
    console.log(formatted);
  }

  toolSuccess(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgCyan.black(' ⚡ TOOL ') 
    });
    console.log(formatted);
  }

  // Database operations
  database(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.magenta('🗄️') 
    });
    console.log(formatted);
  }

  // WhatsApp operations  
  whatsapp(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgGreen.white(' 📱 WHATSAPP ') 
    });
    console.log(formatted);
  }

  // Bot operations
  bot(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgBlue.white(' 🤖 BOT ') 
    });
    console.log(formatted);
  }

  // Provider operations
  provider(message: string, options: LoggerOptions = {}): void {
    const formatted = this.formatMessage(message, { 
      ...options, 
      prefix: chalk.bgMagenta.white(' 🧠 LLM ') 
    });
    console.log(formatted);
  }

  // Special formatting methods
  header(message: string): void {
    const line = '═'.repeat(message.length + 4);
    console.log(chalk.cyan(line));
    console.log(chalk.cyan(`║ ${chalk.bold.white(message)} ║`));
    console.log(chalk.cyan(line));
  }

  subHeader(message: string): void {
    console.log(chalk.blue(`\n▶ ${chalk.bold(message)}`));
  }

  separator(): void {
    console.log(chalk.gray('─'.repeat(50)));
  }

  box(message: string, color: 'green' | 'blue' | 'yellow' | 'red' | 'cyan' | 'magenta' = 'blue'): void {
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    const colorFn = chalk[color];
    
    console.log(colorFn('┌' + '─'.repeat(maxLength + 2) + '┐'));
    lines.forEach(line => {
      const padding = ' '.repeat(maxLength - line.length);
      console.log(colorFn(`│ ${line}${padding} │`));
    });
    console.log(colorFn('└' + '─'.repeat(maxLength + 2) + '┘'));
  }

  newLine(): void {
    console.log('');
  }

  // Progress indicator
  progress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const barLength = 20;
    const filled = Math.round((percentage / 100) * barLength);
    const empty = barLength - filled;
    
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const formatted = `${chalk.blue('⏳')} ${message} [${bar}] ${percentage}% (${current}/${total})`;
    
    // Use \r to overwrite the current line
    process.stdout.write('\r' + formatted);
    
    if (current === total) {
      console.log(''); // New line when complete
    }
  }

  // Clear current line
  clearLine(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  // Startup banner
  banner(appName: string, version: string): void {
    // Helper function to get visual width (excluding ANSI codes)
    const getVisualWidth = (text: string): number => {
      return text.replace(/\x1b\[[0-9;]*m/g, '').length;
    };

    // Create content lines
    const lines = [
      '',
      `     🤖 ${chalk.bold.cyan('WHATSAPP LLM BOT')} - Advanced AI Assistant`,
      '',
      `     ${chalk.green('Version:')} ${chalk.white(version)}`,
      `     ${chalk.green('Stack:')} ${chalk.white('TypeScript + Node.js + Supabase')}`,
      `     ${chalk.green('Features:')} ${chalk.white('Multi-LLM • RAG • Tools • Embeddings')}`,
      ''
    ];

    // Find the maximum visual width
    const maxWidth = Math.max(...lines.map(getVisualWidth));
    const boxWidth = maxWidth + 4; // Add padding

    // Build the box
    const topBorder = '╔' + '═'.repeat(boxWidth - 2) + '╗';
    const bottomBorder = '╚' + '═'.repeat(boxWidth - 2) + '╝';
    
    console.log(chalk.cyan(topBorder));
    
    lines.forEach(line => {
      const visualWidth = getVisualWidth(line);
      const padding = boxWidth - visualWidth - 2;
      const paddedLine = '║' + line + ' '.repeat(padding) + '║';
      console.log(chalk.cyan(paddedLine));
    });
    
    console.log(chalk.cyan(bottomBorder));
  }

  // Stats display
  stats(title: string, stats: Record<string, any>): void {
    this.subHeader(title);
    Object.entries(stats).forEach(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      const capitalizedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
      console.log(`  ${chalk.gray('•')} ${chalk.white(capitalizedKey + ':')} ${chalk.cyan(value)}`);
    });
  }

  // Message display methods
  message(senderInfo: string): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.bgBlue.white(' 📱 INCOMING ') + ' ' + 
                chalk.blue.bold(senderInfo) + ' ' + 
                chalk.gray(`• ${timestamp}`));
  }

  messageContent(content: string): void {
    const lines = content.split('\n');
    lines.forEach(line => {
      console.log(`   ${chalk.cyan('│')} ${chalk.white(line)}`);
    });
  }

  botResponse(content: string): void {
    console.log(chalk.bgGreen.black(' 🤖 RESPONSE ') + ' ' + chalk.green.bold('WhatsApp LLM Bot'));
    const lines = content.split('\n');
    lines.forEach(line => {
      console.log(`   ${chalk.green('│')} ${chalk.white(line)}`);
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for custom instances
export { Logger };