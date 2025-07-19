import chalk from 'chalk';

export class ConsoleArt {
  static whatsappLogo(): string {
    return chalk.green(`
    ████████                      
  ██        ██   ██      ██      
██            ████████████      
██          ████████████        
██        ██████████████        
██      ████████████████        
██    ██████    ████████        
██  ████        ████████        
██████          ████████        
██████          ████████        
██████            ██████        
  ████              ████        
    ████████████████            
      ████████████
`);
  }

  static loadingSpinner(): string[] {
    return [
      chalk.cyan('⠋'),
      chalk.cyan('⠙'), 
      chalk.cyan('⠹'),
      chalk.cyan('⠸'),
      chalk.cyan('⠼'),
      chalk.cyan('⠴'),
      chalk.cyan('⠦'),
      chalk.cyan('⠧'),
      chalk.cyan('⠇'),
      chalk.cyan('⠏')
    ];
  }

  static embeddingAnimation(): string[] {
    return [
      chalk.green('🌱'),
      chalk.green('🌿'),
      chalk.green('🍃'),
      chalk.green('🌳'),
      chalk.green('✨')
    ];
  }

  static qrCodeBorder(): string {
    return chalk.yellow(`
╔═══════════════════════════════════════════╗
║                                           ║
║              QR CODE BELOW                ║
║         Scan with WhatsApp Mobile         ║
║                                           ║
╚═══════════════════════════════════════════╝`);
  }

  static successBox(message: string): string {
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    
    let box = chalk.green('┌' + '─'.repeat(maxLength + 2) + '┐\n');
    lines.forEach(line => {
      const padding = ' '.repeat(maxLength - line.length);
      box += chalk.green(`│ ${line}${padding} │\n`);
    });
    box += chalk.green('└' + '─'.repeat(maxLength + 2) + '┘');
    
    return box;
  }

  static errorBox(message: string): string {
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    
    let box = chalk.red('┌' + '─'.repeat(maxLength + 2) + '┐\n');
    lines.forEach(line => {
      const padding = ' '.repeat(maxLength - line.length);
      box += chalk.red(`│ ${line}${padding} │\n`);
    });
    box += chalk.red('└' + '─'.repeat(maxLength + 2) + '┘');
    
    return box;
  }

  static infoBox(message: string): string {
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    
    let box = chalk.blue('┌' + '─'.repeat(maxLength + 2) + '┐\n');
    lines.forEach(line => {
      const padding = ' '.repeat(maxLength - line.length);
      box += chalk.blue(`│ ${line}${padding} │\n`);
    });
    box += chalk.blue('└' + '─'.repeat(maxLength + 2) + '┘');
    
    return box;
  }

  static embeddingProgressBar(progress: number, total: number): string {
    const percentage = Math.round((progress / total) * 100);
    const barLength = 30;
    const filled = Math.round((percentage / 100) * barLength);
    const empty = barLength - filled;
    
    const filledBar = chalk.bgGreen(' '.repeat(filled));
    const emptyBar = chalk.bgGray(' '.repeat(empty));
    
    return `${chalk.green('🌱')} Embedding: [${filledBar}${emptyBar}] ${percentage}% (${progress}/${total})`;
  }

  static providerBadge(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return chalk.bgMagenta.white(' 🧠 ANTHROPIC ');
      case 'openrouter':
        return chalk.bgBlue.white(' 🔄 OPENROUTER ');
      default:
        return chalk.bgGray.white(` 🤖 ${provider.toUpperCase()} `);
    }
  }

  static toolBadge(toolName: string): string {
    const badges: Record<string, string> = {
      calculator: chalk.bgYellow.black(' 🔢 CALC '),
      weather: chalk.bgBlue.white(' 🌤️ WEATHER '),
      search: chalk.bgCyan.black(' 🔍 SEARCH '),
      time: chalk.bgGreen.black(' ⏰ TIME '),
      uuid: chalk.bgMagenta.white(' 🆔 UUID ')
    };
    
    return badges[toolName.toLowerCase()] || chalk.bgGray.white(` 🔧 ${toolName.toUpperCase()} `);
  }

  static statusIndicator(status: 'success' | 'error' | 'warning' | 'info' | 'progress'): string {
    const indicators = {
      success: chalk.green('●'),
      error: chalk.red('●'),
      warning: chalk.yellow('●'),
      info: chalk.blue('●'),
      progress: chalk.cyan('●')
    };
    
    return indicators[status] || chalk.gray('●');
  }

  static embeddingGlow(text: string): string {
    // Create a glow effect for embedding text
    return chalk.green.bold(`✨ ${text} ✨`);
  }

  static rocketLaunch(): string {
    return chalk.blue(`
       🚀
      /|\\
     / | \\
    |  |  |
    |  |  |
    |_____|
   ███████
  █████████
 ███████████
    🔥🔥🔥`);
  }

  static celebration(): string {
    return `${chalk.yellow('🎉')} ${chalk.green('🎊')} ${chalk.red('🎈')} ${chalk.blue('🎁')} ${chalk.magenta('🎂')}`;
  }

  static wave(): string {
    return chalk.blue('〰️〰️〰️〰️〰️');
  }

  static lightning(): string {
    return chalk.yellow('⚡⚡⚡');
  }

  static sparkles(): string {
    return chalk.white('✨') + chalk.yellow('✨') + chalk.blue('✨') + chalk.green('✨') + chalk.red('✨');
  }

  static divider(char: string = '─', length: number = 50): string {
    return chalk.gray(char.repeat(length));
  }

  static title(text: string): string {
    const border = '═'.repeat(text.length + 4);
    return chalk.cyan(`
╔${border}╗
║  ${chalk.bold.white(text)}  ║
╚${border}╝`);
  }

  static embeddingSuccess(count: number): string {
    return `
${chalk.bgGreen.black(' ✨ EMBEDDING COMPLETE ✨ ')}

${chalk.green('🌳')} Successfully embedded ${chalk.bold.white(count)} items
${chalk.green('📊')} Vector database updated
${chalk.green('🚀')} Ready for RAG queries

${this.sparkles()}`;
  }
}

export const art = ConsoleArt;