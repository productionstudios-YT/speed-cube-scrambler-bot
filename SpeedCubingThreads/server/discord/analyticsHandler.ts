import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { storage } from '../storage';

/**
 * Analytics command handler for the Discord bot
 * Displays real-time performance data and statistics
 */
export class AnalyticsHandler {
  /**
   * Handle the /analytics command
   */
  public async handleAnalyticsCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get analytics type and other parameters from the options
      const analyticsType = interaction.options.getString('type', true);
      const cubeType = interaction.options.getString('cube_type');
      const limit = interaction.options.getInteger('limit') || 10;
      
      // Prepare metrics for display
      let responseEmbeds: EmbedBuilder[] = [];
      
      if (analyticsType === 'overview') {
        // Create overview dashboard with all metrics
        responseEmbeds = await this.generateOverviewAnalytics(interaction);
      } else if (analyticsType === 'commands') {
        // Command usage analytics
        responseEmbeds = await this.generateCommandUsageAnalytics(limit);
      } else if (analyticsType === 'system') {
        // System performance analytics
        responseEmbeds = await this.generateSystemPerformanceAnalytics(limit);
      } else if (analyticsType === 'solves') {
        // Scramble performance analytics (filtered by cube type if provided)
        responseEmbeds = await this.generateScramblePerformanceAnalytics(cubeType, limit);
      } else if (analyticsType === 'daily') {
        // Daily statistics analytics
        responseEmbeds = await this.generateDailyAnalytics(limit);
      } else if (analyticsType === 'combined') {
        // Combined analytics - shows all metrics in one place
        responseEmbeds = await this.generateCombinedAnalytics(interaction, limit, cubeType);
      } else if (analyticsType === 'protips') {
        // Show pro tips for analytics and speedcubing
        responseEmbeds = [this.generateProTips(cubeType)];
      }
      
      if (responseEmbeds.length > 0) {
        await interaction.editReply({ embeds: responseEmbeds });
      } else {
        await interaction.editReply("No analytics data available. Try again after more bot usage has been recorded.");
      }
    } catch (error) {
      console.error('Error handling analytics command:', error);
      try {
        await interaction.editReply('An error occurred while retrieving analytics data. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
  
  /**
   * Generate overview analytics dashboard
   */
  private async generateOverviewAnalytics(interaction: ChatInputCommandInteraction): Promise<EmbedBuilder[]> {
    const embeds: EmbedBuilder[] = [];
    
    // System overview
    const memoryUsage = process.memoryUsage();
    const formattedMemoryUsage = {
      rss: this.formatBytes(memoryUsage.rss),
      heapTotal: this.formatBytes(memoryUsage.heapTotal),
      heapUsed: this.formatBytes(memoryUsage.heapUsed)
    };
    
    const systemEmbed = new EmbedBuilder()
      .setTitle('📊 System Performance Overview')
      .setColor(0x3498DB)
      .setDescription('Current system metrics and performance statistics')
      .addFields(
        { name: '⏱️ Uptime', value: this.formatUptime(interaction.client.uptime || 0), inline: true },
        { name: '🧠 Memory Usage', value: `${formattedMemoryUsage.heapUsed}/${formattedMemoryUsage.heapTotal}`, inline: true },
        { name: '🔄 Status', value: interaction.client.isReady() ? 'Online' : 'Degraded', inline: true }
      );
    embeds.push(systemEmbed);
    
    // Command usage summary
    try {
      // Record current command usage for analytics
      await storage.recordSystemMetrics({
        rssMemory: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        uptime: Math.floor(interaction.client.uptime || 0) / 1000,
        activeThreads: (await storage.getAllChallengeThreads()).filter(t => !t.isDeleted).length,
        cpuUsage: { user: process.cpuUsage().user, system: process.cpuUsage().system },
        loadAverage: [0, 0, 0] // Default values as process.loadavg() might not be available
      });
    
      // Try to get command usage data
      const commandUsage = await storage.getCommandUsage(5);
      let commandsField = 'No command usage data available yet.';
      
      if (commandUsage && commandUsage.length > 0) {
        commandsField = commandUsage.map(cmd => 
          `• ${cmd.commandName}: ${new Date(cmd.timestamp).toLocaleTimeString()}`
        ).join('\n');
      }
      
      const usageEmbed = new EmbedBuilder()
        .setTitle('🔍 Command Usage Summary')
        .setColor(0xE74C3C)
        .setDescription('Recent command interactions and their frequency')
        .addFields(
          { name: 'Recent Commands', value: commandsField, inline: false }
        );
      embeds.push(usageEmbed);
      
      // Scramble performance summary
      const averagePerformance = await storage.getAverageScramblePerformanceByCubeType();
      let performanceField = 'No solve time data available yet.';
      
      if (averagePerformance && averagePerformance.length > 0) {
        performanceField = averagePerformance.map(perf => 
          `• ${perf.cubeType}: ${this.formatDuration(perf.averageSolveTime)}`
        ).join('\n');
      }
      
      const performanceEmbed = new EmbedBuilder()
        .setTitle('⏱️ Scramble Solve Performance')
        .setColor(0x2ECC71)
        .setDescription('Average solve times by cube type')
        .addFields(
          { name: 'Average Solve Times', value: performanceField, inline: false }
        );
      embeds.push(performanceEmbed);
      
    } catch (error) {
      console.error('Error generating analytics overview:', error);
      
      // If we encounter an error but already have the system embed, return just that
      if (embeds.length > 0) {
        return embeds;
      }
      
      // Otherwise create a basic error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while generating analytics data.');
      embeds.push(errorEmbed);
    }
    
    return embeds;
  }
  
  /**
   * Generate command usage analytics
   */
  private async generateCommandUsageAnalytics(limit: number): Promise<EmbedBuilder[]> {
    const embeds: EmbedBuilder[] = [];
    
    try {
      const commandUsage = await storage.getCommandUsage(limit);
      
      const embed = new EmbedBuilder()
        .setTitle('🔍 Command Usage Analytics')
        .setColor(0xE74C3C)
        .setDescription(`Most recent ${limit} commands used`);
      
      if (commandUsage && commandUsage.length > 0) {
        // Create a table for command usage
        let usageTable = '```\n';
        usageTable += '| Command        | User            | Status  | Time       |\n';
        usageTable += '|----------------|-----------------|---------|------------|\n';
        
        commandUsage.forEach(cmd => {
          const time = new Date(cmd.timestamp).toLocaleTimeString();
          const command = cmd.commandName.padEnd(14);
          const user = (cmd.userId.substring(0, 14)).padEnd(16);
          const status = cmd.status.padEnd(9);
          
          usageTable += `| ${command} | ${user} | ${status} | ${time} |\n`;
        });
        
        usageTable += '```';
        embed.setDescription(usageTable);
        
        // Add summary stats
        const commandCounts = new Map<string, number>();
        commandUsage.forEach(cmd => {
          const count = commandCounts.get(cmd.commandName) || 0;
          commandCounts.set(cmd.commandName, count + 1);
        });
        
        let summaryField = '';
        commandCounts.forEach((count, command) => {
          summaryField += `• ${command}: ${count} uses\n`;
        });
        
        embed.addFields(
          { name: 'Command Usage Summary', value: summaryField || 'No data available', inline: false }
        );
      } else {
        embed.setDescription('No command usage data available yet. Try again after using some commands.');
      }
      
      embeds.push(embed);
    } catch (error) {
      console.error('Error generating command usage analytics:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Command Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while retrieving command usage data.');
      embeds.push(errorEmbed);
    }
    
    return embeds;
  }
  
  /**
   * Generate system performance analytics
   */
  private async generateSystemPerformanceAnalytics(limit: number): Promise<EmbedBuilder[]> {
    const embeds: EmbedBuilder[] = [];
    
    try {
      const metrics = await storage.getSystemMetricsHistory(limit);
      
      const embed = new EmbedBuilder()
        .setTitle('📊 System Performance Analytics')
        .setColor(0x3498DB)
        .setDescription(`Last ${limit} system performance measurements`);
      
      if (metrics && metrics.length > 0) {
        // Get latest metric for current stats
        const latest = metrics[0];
        
        embed.addFields(
          { name: '🧠 Current Memory', value: `RSS: ${this.formatBytes(latest.rssMemory)}\nHeap: ${this.formatBytes(latest.heapUsed)}/${this.formatBytes(latest.heapTotal)}`, inline: true },
          { name: '⏱️ Uptime', value: this.formatUptime(latest.uptime * 1000), inline: true },
          { name: '🧵 Active Threads', value: latest.activeThreads.toString(), inline: true }
        );
        
        // Create a memory usage history graph (text-based)
        let memoryHistory = '```\nMemory Usage History (Most Recent First):\n';
        memoryHistory += '|  Time  | RSS Memory | Heap Used | Active Threads |\n';
        memoryHistory += '|--------|------------|-----------|----------------|\n';
        
        metrics.forEach(metric => {
          const time = new Date(metric.timestamp).toLocaleTimeString();
          const rss = this.formatBytes(metric.rssMemory).padEnd(10);
          const heap = this.formatBytes(metric.heapUsed).padEnd(9);
          const threads = metric.activeThreads.toString().padEnd(14);
          
          memoryHistory += `| ${time} | ${rss} | ${heap} | ${threads} |\n`;
        });
        
        memoryHistory += '```';
        
        const historyEmbed = new EmbedBuilder()
          .setTitle('📈 Performance History')
          .setColor(0x1ABC9C)
          .setDescription(memoryHistory);
        
        embeds.push(embed);
        embeds.push(historyEmbed);
      } else {
        embed.setDescription('No system metrics data available yet. System metrics are being recorded periodically.');
        embeds.push(embed);
      }
    } catch (error) {
      console.error('Error generating system performance analytics:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ System Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while retrieving system performance data.');
      embeds.push(errorEmbed);
    }
    
    return embeds;
  }
  
  /**
   * Generate scramble performance analytics
   */
  private async generateScramblePerformanceAnalytics(cubeType: string | null, limit: number): Promise<EmbedBuilder[]> {
    const embeds: EmbedBuilder[] = [];
    
    try {
      let performanceData;
      let title = '⏱️ Scramble Solve Performance';
      let description = `Last ${limit} recorded solve times`;
      
      // If cube type is provided, filter by cube type
      if (cubeType) {
        title = `⏱️ ${cubeType} Scramble Performance`;
        description = `Last ${limit} recorded solve times for ${cubeType}`;
        performanceData = await storage.getScramblePerformanceByCubeType(cubeType, limit);
      } else {
        performanceData = await storage.getScramblePerformance(limit);
      }
      
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x2ECC71)
        .setDescription(description);
      
      if (performanceData && performanceData.length > 0) {
        // Calculate average time
        const validTimes = performanceData.filter(p => p.solveTime !== null);
        let avgTime = 0;
        
        if (validTimes.length > 0) {
          avgTime = validTimes.reduce((sum, p) => sum + (p.solveTime || 0), 0) / validTimes.length;
        }
        
        // Add summary stats
        embed.addFields(
          { name: '🧮 Average Time', value: this.formatDuration(avgTime), inline: true },
          { name: '📊 Total Solves', value: validTimes.length.toString(), inline: true }
        );
        
        // Create a table with the performance data
        let performanceTable = '```\n';
        performanceTable += '|  Time  | User ID        | Cube Type | Solve Time  | Custom |\n';
        performanceTable += '|--------|----------------|-----------|-------------|--------|\n';
        
        performanceData.forEach(perf => {
          const time = new Date(perf.timestamp).toLocaleTimeString();
          const user = perf.userId.substring(0, 14).padEnd(14);
          const cube = perf.cubeType.padEnd(9);
          const solveTime = perf.solveTime ? this.formatDuration(perf.solveTime).padEnd(11) : 'N/A'.padEnd(11);
          const custom = perf.isCustomScramble ? 'Yes' : 'No';
          
          performanceTable += `| ${time} | ${user} | ${cube} | ${solveTime} | ${custom.padEnd(6)} |\n`;
        });
        
        performanceTable += '```';
        
        const dataEmbed = new EmbedBuilder()
          .setTitle('📋 Solve Time Data')
          .setColor(0xF39C12)
          .setDescription(performanceTable);
        
        embeds.push(embed);
        embeds.push(dataEmbed);
        
        // Add average times by cube type if no specific cube type was selected
        if (!cubeType) {
          const averagesByType = await storage.getAverageScramblePerformanceByCubeType();
          
          if (averagesByType && averagesByType.length > 0) {
            let averagesField = '';
            averagesByType.forEach(avg => {
              averagesField += `• ${avg.cubeType}: ${this.formatDuration(avg.averageSolveTime)}\n`;
            });
            
            const averagesEmbed = new EmbedBuilder()
              .setTitle('📈 Average Times by Cube Type')
              .setColor(0x9B59B6)
              .setDescription(averagesField);
            
            embeds.push(averagesEmbed);
          }
        }
      } else {
        embed.setDescription('No scramble solve data available yet. Try again after some solves have been recorded using the `/scramble` command.');
        embeds.push(embed);
      }
    } catch (error) {
      console.error('Error generating scramble performance analytics:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Scramble Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while retrieving scramble performance data.');
      embeds.push(errorEmbed);
    }
    
    return embeds;
  }
  
  /**
   * Generate daily analytics
   */
  private async generateDailyAnalytics(limit: number): Promise<EmbedBuilder[]> {
    const embeds: EmbedBuilder[] = [];
    
    try {
      // Calculate date range (from limit days ago to today)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - limit);
      
      const dailyData = await storage.getDailyAnalyticsRange(startDate, endDate);
      
      const embed = new EmbedBuilder()
        .setTitle('📅 Daily Bot Analytics')
        .setColor(0xF1C40F)
        .setDescription(`Analytics for the last ${limit} days`);
      
      if (dailyData && dailyData.length > 0) {
        // Add summary stats
        const totalThreads = dailyData.reduce((sum, day) => sum + day.threadsCreated, 0);
        const totalCommands = dailyData.reduce((sum, day) => sum + day.commandsUsed, 0);
        const avgSolveTime = dailyData.reduce((sum, day) => sum + day.averageSolveTime, 0) / dailyData.length;
        
        embed.addFields(
          { name: '🧵 Total Threads', value: totalThreads.toString(), inline: true },
          { name: '🔍 Total Commands', value: totalCommands.toString(), inline: true },
          { name: '⏱️ Avg Solve Time', value: this.formatDuration(avgSolveTime), inline: true }
        );
        
        // Create a table with the daily data
        let dailyTable = '```\n';
        dailyTable += '|  Date  | Threads | Commands | Avg Solve Time |\n';
        dailyTable += '|--------|---------|----------|----------------|\n';
        
        // Sort by date descending (most recent first)
        const sortedData = [...dailyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        sortedData.forEach(day => {
          const date = new Date(day.date).toLocaleDateString();
          const threads = day.threadsCreated.toString().padEnd(7);
          const commands = day.commandsUsed.toString().padEnd(8);
          const avgTime = this.formatDuration(day.averageSolveTime).padEnd(14);
          
          dailyTable += `| ${date} | ${threads} | ${commands} | ${avgTime} |\n`;
        });
        
        dailyTable += '```';
        
        const tableEmbed = new EmbedBuilder()
          .setTitle('📈 Daily Activity')
          .setColor(0x3498DB)
          .setDescription(dailyTable);
        
        embeds.push(embed);
        embeds.push(tableEmbed);
      } else {
        embed.setDescription('No daily analytics data available yet. Data is collected at the end of each day.');
        embeds.push(embed);
      }
    } catch (error) {
      console.error('Error generating daily analytics:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Daily Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while retrieving daily analytics data.');
      embeds.push(errorEmbed);
    }
    
    return embeds;
  }
  
  /**
   * Generate combined analytics - shows all metrics in one place
   */
  private async generateCombinedAnalytics(
    interaction: ChatInputCommandInteraction, 
    limit: number, 
    cubeType: string | null
  ): Promise<EmbedBuilder[]> {
    try {
      // Create a container for all embeds
      const allEmbeds: EmbedBuilder[] = [];
      
      // Title embed to explain what's being shown
      const titleEmbed = new EmbedBuilder()
        .setTitle('🔄 Combined Analytics Dashboard')
        .setColor(0x9B59B6)
        .setDescription('Comprehensive view of all metrics and analytics in one place')
        .addFields(
          { 
            name: 'Dashboard Contents', 
            value: '• System Performance\n• Command Usage\n• Scramble Performance\n• Daily Statistics', 
            inline: false 
          }
        );
      allEmbeds.push(titleEmbed);
      
      // Add system performance data
      const systemEmbeds = await this.generateSystemPerformanceAnalytics(Math.min(5, limit));
      // Add the most relevant system embed (usually the first one)
      if (systemEmbeds.length > 0) {
        allEmbeds.push(systemEmbeds[0]);
      }
      
      // Add command usage data
      const commandEmbeds = await this.generateCommandUsageAnalytics(Math.min(5, limit));
      // Add the most relevant command embed
      if (commandEmbeds.length > 0) {
        allEmbeds.push(commandEmbeds[0]);
      }
      
      // Add scramble performance data
      const scrambleEmbeds = await this.generateScramblePerformanceAnalytics(cubeType, Math.min(5, limit));
      // Add the most relevant scramble embed
      if (scrambleEmbeds.length > 0) {
        allEmbeds.push(scrambleEmbeds[0]);
      }
      
      // Add daily analytics data
      const dailyEmbeds = await this.generateDailyAnalytics(Math.min(5, limit));
      // Add the most relevant daily embed
      if (dailyEmbeds.length > 0) {
        allEmbeds.push(dailyEmbeds[0]);
      }
      
      // If we've collected data, return it
      if (allEmbeds.length > 1) { // More than just the title embed
        return allEmbeds;
      } else {
        // Add a message about no data
        titleEmbed.setDescription('No analytics data is available yet. Try using the bot more to generate meaningful analytics.');
        return [titleEmbed];
      }
    } catch (error) {
      console.error('Error generating combined analytics:', error);
      
      // Return an error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Combined Analytics Error')
        .setColor(0xED4245)
        .setDescription('An error occurred while generating the combined analytics dashboard.');
      
      return [errorEmbed];
    }
  }
  
  /**
   * Generate pro tips for speedcubing analytics
   * This provides helpful insights and tips for interpreting data and improving solve times
   */
  private generateProTips(cubeType: string | null = null): EmbedBuilder {
    // Create a collection of pro tips organized by category
    const generalTips = [
      "Track your progress over time by comparing daily analytics trends rather than focusing on single results",
      "Use the 'Combined' analytics view for a comprehensive overview of your performance across all metrics",
      "The most efficient practice happens when focusing on your weakest areas shown in the analytics",
      "Share insights from your analytics with other cubers to get advice on improvement strategies",
      "Pay attention to time-of-day patterns in your solve times to find your optimal practice window"
    ];
    
    const techniqueBasedTips = [
      "When analytics show inconsistent times, focus on improving F2L lookahead rather than learning new algorithms",
      "Cross solutions should take ~12% of your total solve time; use metrics to verify if you're meeting this benchmark",
      "Compare your averages with the global database to identify which solving phases need the most improvement",
      "If your solve time distribution has high variance, focus on consistency before speed",
      "Analyze DNF patterns to identify specific weaknesses in your solving method"
    ];
    
    const equipmentBasedTips = [
      "Test different cube tensioning settings and track performance changes in analytics",
      "Switch between different lubes and track how they affect your average times over multiple sessions",
      "Consider using a metronome to practice turning at consistent TPS (Turns Per Second) rates",
      "Temperature affects cube performance; track solve environment metrics alongside times",
      "When comparing cubes, use at least 100 solves per cube to get statistically significant data"
    ];
    
    // Get random unique tips from each category
    const getRandomTips = (tips: string[], count: number): string[] => {
      const shuffled = [...tips].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };
    
    // Select tips based on cube type if provided
    let selectedTips: string[] = [];
    let tipTitle = "🧠 Pro Analytics Tips";
    let tipDescription = "Use these insights to improve your speedcubing analytics experience:";
    
    if (cubeType) {
      // Add some cube-specific tips based on the cube type
      const cubeSpecificTips: Record<string, string[]> = {
        "2x2": [
          "For 2x2, focus on one-looking the entire solve; your analytics should show sub-1 second recognition time",
          "Track CLL vs. Ortega method performance separately to determine which is faster for you",
          "2x2 scrambles with 1-2 solved faces often lead to faster times; track these patterns"
        ],
        "3x3": [
          "For 3x3, compare your solve phase breakdowns (cross, F2L, OLL, PLL) to identify bottlenecks",
          "Track your F2L pair recognition time separately from execution time",
          "Consider analyzing your times by OLL/PLL case to identify problem algorithms"
        ],
        "3x3 BLD": [
          "In BLD solving, memo time should ideally be twice as long as execution time",
          "Track your success rate alongside speed to ensure you're not sacrificing accuracy",
          "Analyze which letter pairs cause the most memo delays"
        ],
        "3x3 OH": [
          "For OH solving, track algorithm subset performance to identify which need OH-specific algs",
          "Compare your OH vs. two-handed solve distribution to identify OH-specific weaknesses",
          "OH solving benefits from different cube tensions; track performance changes after adjustments"
        ],
        "Pyraminx": [
          "For Pyraminx, track solve times with and without pre-inspection to gauge recognition improvement",
          "Compare your times using different methods (e.g., layer-by-layer vs. top-first)",
          "Edge orientation recognition is often the bottleneck in Pyraminx solves"
        ],
        "Skewb": [
          "Track your Skewb center recognition time separately from corner execution",
          "Compare your first vs. second half of Skewb solves to identify fatigue patterns",
          "For Skewb, fixed rotation patterns often lead to faster solves than intuitive solutions"
        ],
        "Clock": [
          "For Clock, track your pin setting time as a separate metric from dial turning",
          "Clock solving benefits from consistent pin setting patterns; track which patterns yield better times",
          "Analyze your Clock DNFs to identify if they're from pin setting errors or dial misreading"
        ]
      };
      
      // Get cube-specific tips
      const specificTips = cubeSpecificTips[cubeType] || [];
      
      // Mix some cube-specific tips with general tips
      selectedTips = [
        ...specificTips,
        ...getRandomTips(generalTips, 4),
        ...getRandomTips(techniqueBasedTips, 4),
        ...getRandomTips(equipmentBasedTips, 4)
      ].slice(0, 15); // Ensure we have exactly 15 tips
      
      tipTitle = `🧠 Pro ${cubeType} Analytics Tips`;
      tipDescription = `Specialized analytics insights for ${cubeType} solving:`;
    } else {
      // Get a mix of tips from all categories
      selectedTips = [
        ...getRandomTips(generalTips, 5),
        ...getRandomTips(techniqueBasedTips, 5),
        ...getRandomTips(equipmentBasedTips, 5)
      ];
    }
    
    // Format tips as a numbered list
    const formattedTips = selectedTips.map((tip, index) => `**${index + 1}.** ${tip}`).join('\n\n');
    
    // Create an embed with the tips
    const tipsEmbed = new EmbedBuilder()
      .setTitle(tipTitle)
      .setColor(0xF1C40F)
      .setDescription(`${tipDescription}\n\n${formattedTips}`)
      .setFooter({ text: 'Pro tip: Use these insights daily to continuously improve your solving skills!' });
    
    return tipsEmbed;
  }
  
  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Format milliseconds to readable uptime format
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }
  
  /**
   * Format duration in milliseconds to a readable string
   */
  private formatDuration(ms: number): string {
    if (ms === 0) return '0.00s';
    
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`;
    }
    
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(2)}s`;
  }
}

// Export an instance of the handler
export const analyticsHandler = new AnalyticsHandler();