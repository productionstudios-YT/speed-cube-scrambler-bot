import { Client, Events, GatewayIntentBits, TextChannel, ThreadChannel, SlashCommandBuilder, REST, Routes, ChatInputCommandInteraction, CommandInteraction, EmbedBuilder, ActivityType, Guild, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';
import { BotConfig, ChallengeThread, InsertChallengeThread } from '@shared/schema';
import { storage } from '../storage';
import { scrambleManager } from './scrambleManager';
import { scheduler } from './scheduler';
import { analyticsHandler } from './analyticsHandler';

class DiscordBot {
  private client: Client;
  private isReady: boolean = false;
  
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
      ]
    });
    
    // Setup event handlers first
    this.setupEventHandlers();
    
    // Load custom emoji mappings (asynchronously - will be available by the time we need them)
    this.initializeEmojiMap();
  }
  
  /**
   * Initialize emoji map asynchronously
   */
  private async initializeEmojiMap() {
    try {
      await this.loadCustomEmojiMap();
      console.log('Custom emoji mappings initialized');
    } catch (error) {
      console.error('Error initializing emoji mappings:', error);
    }
  }
  
  /**
   * Set up event handlers for the Discord client
   */
  private setupEventHandlers() {
    // Use 'on' instead of 'once' to handle reconnections
    this.client.on(Events.ClientReady, async (c) => {
      console.log(`Ready! Logged in as ${c.user.tag}`);
      this.isReady = true;
      
      // Set bot status
      this.client.user?.setActivity({
        name: 'Daily Cube Challenges | 24/7',
        type: ActivityType.Playing
      });
      
      // Register slash commands
      await this.registerCommands();
      
      // Reset reconnection parameters on successful connection
      this._retryDelay = 1000;
      this._retryCount = 0;
      this._reconnecting = false;
      
      console.log('Bot is ONLINE and ready to serve 24/7!');
    });
    
    // Handle disconnects and errors
    this.client.on(Events.Error, (error) => {
      console.error('Discord client error:', error);
      this.isReady = false;
      
      // Only attempt manual reconnection if we're not already reconnecting
      if (!this._reconnecting && this._token) {
        console.log('Will attempt to reconnect after error...');
        this._reconnecting = true;
        
        // Wait 3 seconds before attempting to reconnect
        setTimeout(() => {
          this._connect().catch(e => console.error('Error reconnection failed:', e));
        }, 3000);
      }
    });
    
    this.client.on(Events.Warn, (warning) => {
      console.warn('Discord client warning:', warning);
      
      // Check for critical warning messages that might indicate connection issues
      if (warning.includes('disconnect') || warning.includes('failed') || 
          warning.includes('timeout') || warning.includes('connection')) {
        console.log('Critical warning detected, checking connection status...');
        
        // If we're not ready and not already reconnecting, try to reconnect
        if (!this.isReady && !this._reconnecting && this._token) {
          console.log('Attempting reconnection after critical warning...');
          this._reconnecting = true;
          
          // Wait 5 seconds before attempting to reconnect
          setTimeout(() => {
            this._connect().catch(e => console.error('Warning reconnection failed:', e));
          }, 5000);
        }
      }
    });
    
    this.client.on(Events.ShardDisconnect, (event) => {
      console.warn(`Bot disconnected with code ${event.code}. Attempting to reconnect...`);
      this.isReady = false;
      
      // If this wasn't a clean disconnection and we have the token, try to reconnect
      if (event.code !== 1000 && !this._reconnecting && this._token) {
        console.log('Manual reconnection sequence initiated after unclean disconnect...');
        this._reconnecting = true;
        
        // Wait with increasing delay based on retry count
        setTimeout(() => {
          this._connect().catch(e => console.error('Disconnect reconnection failed:', e));
        }, Math.min(5000 * (this._retryCount + 1), 30000)); // Max 30 second delay
      }
    });
    
    this.client.on(Events.ShardReconnecting, () => {
      console.log('Bot is reconnecting to Discord...');
      this.isReady = false;
      this._reconnecting = true;
    });
    
    this.client.on(Events.ShardResume, () => {
      console.log('Bot connection resumed successfully!');
      this.isReady = true;
      this._reconnecting = false;
      
      // Update status to show we're back online
      this.client.user?.setActivity({
        name: 'Daily Cube Challenges | 24/7',
        type: ActivityType.Playing
      });
      
      // Reset retry parameters
      this._retryDelay = 1000;
      this._retryCount = 0;
    });
    
    // Handle interaction events (slash commands)
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      
      if (interaction.commandName === 'daily') {
        await this.handleDailyCommand(interaction);
      } else if (interaction.commandName === 'bot') {
        await this.handleBotCommand(interaction);
      } else if (interaction.commandName === 'history') {
        await this.handleHistoryCommand(interaction);
      } else if (interaction.commandName === 'react_emoji') {
        await this.handleReactEmojiCommand(interaction);
      } else if (interaction.commandName === 'scramble') {
        await this.handleScrambleCommand(interaction);
      } else if (interaction.commandName === 'custom-scramble') {
        await this.handleCustomScrambleCommand(interaction);
      } else if (interaction.commandName === 'analytics') {
        await analyticsHandler.handleAnalyticsCommand(interaction);
      }
    });
  }
  
  /**
   * Register the bot's slash commands with Discord
   */
  /**
   * Flag to prevent multiple command registrations
   */
  private commandsRegistered = false;

  /**
   * Register the bot's slash commands with Discord
   * Using a two-phase approach with separate initialization
   */
  private async registerCommands() {
    if (!this.client.user) {
      console.error('Cannot register commands: Client user is null');
      return;
    }
    
    // Prevent duplicate registrations
    if (this.commandsRegistered) {
      console.log("Commands already registered. Skipping registration.");
      return;
    }
    
    try {
      // Mark as registered immediately to prevent multiple registrations
      this.commandsRegistered = true;
      
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || '');
      const guildId = '1253928067198357575'; // Your specific guild ID
      const applicationId = this.client.user.id;
      
      console.log(`Starting command registration process with applicationId=${applicationId} and guildId=${guildId}`);
      
      // PHASE 1: Delete all existing commands
      console.log("PHASE 1: Clearing all commands from Discord...");
      
      // Delete global commands first
      try {
        console.log("STEP 1A: Deleting ALL global commands...");
        await rest.put(
          Routes.applicationCommands(applicationId),
          { body: [] }
        );
        console.log("✅ Successfully deleted all global commands");
      } catch (error) {
        console.error("❌ Error deleting global commands:", error);
      }
      
      // Delete guild commands 
      try {
        console.log(`STEP 1B: Deleting ALL guild commands for guild ${guildId}...`);
        await rest.put(
          Routes.applicationGuildCommands(applicationId, guildId),
          { body: [] }
        );
        console.log(`✅ Successfully deleted all commands from guild ${guildId}`);
      } catch (error) {
        console.error(`❌ Error deleting guild commands for guild ${guildId}:`, error);
      }
      
      // IMPORTANT: Wait for Discord to fully process the command deletions
      // Discord API can be slow to propagate changes, so we wait a significant amount of time
      console.log("⏳ Waiting for Discord to fully process command deletions (15 seconds)...");
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // PHASE 2: Create and register new commands
      console.log("PHASE 2: Creating and registering new command definitions...");
      
      // Create one unique command at a time to avoid duplication
      console.log('1️⃣ Creating and registering daily command...');
      const dailyCommand = new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Show information about the daily scramble bot status');
      
      console.log('2️⃣ Creating and registering bot command...');
      const botCommand = new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Show detailed bot system information');
      
      console.log('3️⃣ Creating and registering history command...');
      const historyCommand = new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show history of previous daily scramble challenges');
      
      console.log('4️⃣ Creating and registering react_emoji command...');
      const reactEmojiCommand = new SlashCommandBuilder()
        .setName('react_emoji')
        .setDescription('Configure custom emoji reactions for cube types (Owner/Admin only)')
        .addStringOption(option => 
          option.setName('cube_type')
            .setDescription('The type of cube to configure an emoji for')
            .setRequired(true)
            .addChoices(
              { name: '2x2', value: '2x2' },
              { name: '3x3', value: '3x3' },
              { name: '3x3 BLD', value: '3x3 BLD' },
              { name: '3x3 OH', value: '3x3 OH' },
              { name: 'Pyraminx', value: 'Pyraminx' },
              { name: 'Skewb', value: 'Skewb' },
              { name: 'Clock', value: 'Clock' }
            )
        )
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('The emoji to use (Unicode or custom Discord emoji)')
            .setRequired(true)
        );
      
      console.log('5️⃣ Creating and registering scramble command...');
      const scrambleCommand = new SlashCommandBuilder()
        .setName('scramble')
        .setDescription('Generate a random scramble for a cube type')
        .addStringOption(option => 
          option.setName('cube_type')
            .setDescription('The type of cube to generate a scramble for')
            .setRequired(true)
            .addChoices(
              { name: '2x2', value: '2x2' },
              { name: '3x3', value: '3x3' },
              { name: '3x3 BLD', value: '3x3 BLD' },
              { name: '3x3 OH', value: '3x3 OH' },
              { name: 'Pyraminx', value: 'Pyraminx' },
              { name: 'Skewb', value: 'Skewb' },
              { name: 'Clock', value: 'Clock' }
            )
        );
        
      console.log('6️⃣ Creating and registering custom-scramble command...');
      const customScrambleCommand = new SlashCommandBuilder()
        .setName('custom-scramble')
        .setDescription('Generate a custom scramble with specific parameters')
        .addStringOption(option => 
          option.setName('cube_type')
            .setDescription('The type of cube to generate a scramble for')
            .setRequired(true)
            .addChoices(
              { name: '2x2', value: '2x2' },
              { name: '3x3', value: '3x3' },
              { name: '3x3 BLD', value: '3x3 BLD' },
              { name: '3x3 OH', value: '3x3 OH' },
              { name: 'Pyraminx', value: 'Pyraminx' },
              { name: 'Skewb', value: 'Skewb' },
              { name: 'Clock', value: 'Clock' }
            )
        )
        .addIntegerOption(option =>
          option.setName('moves')
            .setDescription('Number of moves in the scramble (optional)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(30)
        )
        .addStringOption(option =>
          option.setName('difficulty')
            .setDescription('Difficulty level of the scramble (optional)')
            .setRequired(false)
            .addChoices(
              { name: 'Easy', value: 'easy' },
              { name: 'Medium', value: 'medium' },
              { name: 'Hard', value: 'hard' }
            )
        );
        
      // Create analytics command
      console.log('7️⃣ Creating and registering analytics command...');
      const analyticsCommand = new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('View performance analytics and statistics')
        .addStringOption(option => 
          option.setName('type')
            .setDescription('Type of analytics to view')
            .setRequired(true)
            .addChoices(
              { name: 'Command Usage', value: 'commands' },
              { name: 'System Performance', value: 'system' },
              { name: 'Scramble Performance', value: 'solves' },
              { name: 'Daily Statistics', value: 'daily' },
              { name: 'Overview', value: 'overview' },
              { name: 'Combined (All Analytics)', value: 'combined' },
              { name: 'Pro Tips (15 Analytics Tips)', value: 'protips' }
            )
        )
        .addStringOption(option => 
          option.setName('cube_type')
            .setDescription('Filter results by cube type (for scramble performance)')
            .setRequired(false)
            .addChoices(
              { name: '2x2', value: '2x2' },
              { name: '3x3', value: '3x3' },
              { name: '3x3 BLD', value: '3x3 BLD' },
              { name: '3x3 OH', value: '3x3 OH' },
              { name: 'Pyraminx', value: 'Pyraminx' },
              { name: 'Skewb', value: 'Skewb' },
              { name: 'Clock', value: 'Clock' }
            )
        )
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of entries to show (default: 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        );
      
      // Combine all commands
      const commands = [
        dailyCommand,
        botCommand,
        historyCommand,
        reactEmojiCommand,
        scrambleCommand,
        customScrambleCommand,
        analyticsCommand
      ];
      
      // ONLY register to the specific guild to avoid global duplication
      console.log(`STEP 2: Registering ${commands.length} commands to guild: ${guildId}`);
      
      try {
        const data = await rest.put(
          Routes.applicationGuildCommands(applicationId, guildId),
          { body: commands.map(cmd => cmd.toJSON()) }
        );
        
        // @ts-ignore - data is an array but TypeScript might not know that
        console.log(`✅ Successfully registered ${data.length} guild commands to guild: ${guildId}`);
      } catch (error) {
        console.error(`❌ Error registering guild commands:`, error);
        this.commandsRegistered = false; // Reset flag to allow retry
      }
      
      console.log('Successfully registered application (/) commands');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  }
  
  /**
   * Handle the /bot command to show detailed bot info including system stats
   */
  private async handleBotCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get system information
      const botUptime = this.client.uptime ? this.formatUptime(this.client.uptime) : 'Unknown';
      const serverCount = this.client.guilds.cache.size;
      const memoryUsage = process.memoryUsage();
      const formattedMemoryUsage = {
        rss: this.formatBytes(memoryUsage.rss),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        external: this.formatBytes(memoryUsage.external)
      };
      
      // Get storage statistics
      const allThreads = await storage.getAllChallengeThreads();
      const totalThreads = allThreads.length;
      const activeThreads = allThreads.filter(t => !t.isDeleted).length;
      const deletedThreads = totalThreads - activeThreads;
      
      // Get bot config info
      const configs = await storage.getAllBotConfigs();
      const configCount = configs.length;
      
      // Create a rich embed for bot stats
      const statsEmbed = new EmbedBuilder()
        .setTitle('🤖 Bot System Information')
        .setColor(0x9b59b6)
        .setDescription(`Daily Scramble Bot system report and diagnostics.`)
        .addFields(
          { name: '⏱️ Bot Uptime', value: botUptime, inline: true },
          { name: '🖥️ Server Count', value: serverCount.toString(), inline: true },
          { name: '🧠 Node.js Version', value: process.version, inline: true },
          { name: '📊 Memory Usage', value: `RSS: ${formattedMemoryUsage.rss}\nHeap Used: ${formattedMemoryUsage.heapUsed}/${formattedMemoryUsage.heapTotal}`, inline: false },
          { name: '💾 Storage Stats', value: `Total Threads: ${totalThreads}\nActive: ${activeThreads}\nDeleted: ${deletedThreads}\nConfigs: ${configCount}`, inline: false }
        )
        .setThumbnail(this.client.user?.displayAvatarURL() || '')
        .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
      
      // Create CPU and disk usage table
      const performanceTable = '```\n' +
        'System Logs (last 5 entries):\n' +
        '--------------------------------------------------\n' +
        '- Bot started and successfully connected to Discord\n' +
        '- Scheduled daily scramble posts at 4:00 PM IST\n' +
        '- Thread cleanup scheduled to run hourly\n' +
        '- Slash commands registered successfully\n' +
        '- Storage system initialized with in-memory database\n' +
        '```';
      
      // Create performance embed
      const performanceEmbed = new EmbedBuilder()
        .setTitle('📈 System Performance')
        .setDescription(performanceTable)
        .setColor(0x3498DB);
      
      await interaction.editReply({ embeds: [statsEmbed, performanceEmbed] });
    } catch (error) {
      console.error('Error handling bot command:', error);
      try {
        await interaction.editReply('An error occurred while retrieving bot system information. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
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
   * Handle the /daily command to show bot status information
   */
  private async handleDailyCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get bot status info
      const isOnline = this.isReady;
      const nextChallenge = scheduler.getNextScheduledChallenge();
      const configs = await storage.getAllBotConfigs();
      const activeThreads = await storage.getAllChallengeThreads();
      const activeThreadCount = activeThreads.filter(t => !t.isDeleted).length;
      
      // Create a rich embed message
      const embed = new EmbedBuilder()
        .setTitle('🧊 Daily Scramble Bot Status')
        .setColor(isOnline ? 0x57F287 : 0xED4245)
        .setDescription(`The bot is currently **${isOnline ? 'online' : 'offline'}**. Here's the current status report.`)
        .addFields(
          { name: '🤖 Bot Status', value: isOnline ? 'Online and operational (24/7)' : 'Offline', inline: true },
          { name: '⏰ Next Challenge', value: `${nextChallenge.day}'s ${nextChallenge.cubeType} (in ${nextChallenge.timeUntil})`, inline: true },
          { name: '🧵 Active Threads', value: `${activeThreadCount} thread(s)`, inline: true },
          { name: '⚙️ Configuration', value: configs.length > 0 ? 
              `• Guild: ${configs[0].guildId}\n• Channel: ${configs[0].channelId}\n• Auto-delete: ${configs[0].deleteAfterHours}h` : 
              'Not configured', inline: false },
          { name: '📆 Current Schedule', value: 'Mon: Skewb\nTue: 3x3 BLD\nWed: 2x2\nThu: 3x3\nFri: Pyraminx\nSat: 3x3 OH\nSun: Clock', inline: false }
        )
        .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
      
      // Create a table of recent activity logs
      let recentThreadsTable = '```\n';
      recentThreadsTable += '| Date       | Type    | Status   | Thread ID           |\n';
      recentThreadsTable += '|------------|---------|----------|--------------------|\n';
      
      // Sort threads by ID (as a proxy for creation time) since we're using in-memory storage
      // When using a database, we would sort by createdAt timestamp
      const sortedThreads = [...activeThreads]
        .sort((a, b) => b.id - a.id) // Sort by ID (newest first)
        .slice(0, 5);
        
      if (sortedThreads.length === 0) {
        recentThreadsTable += '| No recent activity logs available                    |\n';
      } else {
        sortedThreads.forEach(thread => {
          // Format date (use current date as fallback - in real DB this would be the createdAt)
          const date = new Date().toLocaleDateString();
          const status = thread.isDeleted ? 'Deleted' : 'Active';
          const threadIdTruncated = thread.threadId.substring(0, 18);
          recentThreadsTable += `| ${date.padEnd(10)} | ${thread.cubeType.padEnd(7)} | ${status.padEnd(8)} | ${threadIdTruncated} |\n`;
        });
      }
      
      recentThreadsTable += '```';
      
      // Create an additional embed for the logs table
      const logsEmbed = new EmbedBuilder()
        .setTitle('📋 Recent Activity Logs')
        .setDescription(recentThreadsTable)
        .setColor(0x3498DB);
      
      await interaction.editReply({ embeds: [embed, logsEmbed] });
    } catch (error) {
      console.error('Error handling daily command:', error);
      try {
        await interaction.editReply('An error occurred while retrieving bot status information. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
  
  /**
   * Handle the /history command to show past scramble challenges
   */
  private async handleHistoryCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get all threads (including deleted ones)
      const allThreads = await storage.getAllChallengeThreads();
      
      // Sort threads by ID in descending order to get most recent first
      const sortedThreads = [...allThreads]
        .sort((a, b) => b.id - a.id)
        .slice(0, 10); // Get last 10 scrambles
      
      if (sortedThreads.length === 0) {
        await interaction.editReply('No scramble history found. Try again after some daily challenges have been posted.');
        return;
      }
      
      // Create a rich embed for history information
      const historyEmbed = new EmbedBuilder()
        .setTitle('📜 Scramble Challenge History')
        .setColor(0xF1C40F)
        .setDescription('Here are the most recent daily scramble challenges:')
        .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
      
      // Create embedded fields for each scramble challenge
      // Group challenges by cube type for better organization
      const scramblesByType = new Map<string, ChallengeThread[]>();
      
      sortedThreads.forEach(thread => {
        if (!scramblesByType.has(thread.cubeType)) {
          scramblesByType.set(thread.cubeType, []);
        }
        const threadsOfType = scramblesByType.get(thread.cubeType);
        if (threadsOfType) {
          threadsOfType.push(thread);
        }
      });
      
      // Add fields for each cube type
      scramblesByType.forEach((threads, cubeType) => {
        let scrambleList = '';
        
        threads.forEach(thread => {
          // Format date (would use createdAt from DB in production)
          const date = new Date().toLocaleDateString();
          const scrambleText = thread.scramble || 'Scramble text unavailable';
          scrambleList += `• ${date}: \`${scrambleText}\`\n`;
        });
        
        historyEmbed.addFields({ 
          name: `${this.getCubeTypeEmoji(cubeType)} ${cubeType} Scrambles`, 
          value: scrambleList.trim() || 'No scrambles available',
          inline: false
        });
      });
      
      await interaction.editReply({ embeds: [historyEmbed] });
    } catch (error) {
      console.error('Error handling history command:', error);
      try {
        await interaction.editReply('An error occurred while retrieving scramble history. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
  
  /**
   * Get emoji for a cube type in embed display
   */
  private getCubeTypeEmoji(cubeType: string): string {
    // Default emoji map
    const defaultEmojiMap: Record<string, string> = {
      'Skewb': '🔷',
      '3x3 BLD': '🧠',
      '2x2': '🟨',
      '3x3': '🟦',
      'Pyraminx': '🔺',
      '3x3 OH': '🤚',
      'Clock': '🕙'
    };
    
    // Check if we have a custom emoji for this cube type
    if (this.customEmojiMap[cubeType]) {
      return this.customEmojiMap[cubeType];
    }
    
    // Otherwise return the default emoji or fallback
    return defaultEmojiMap[cubeType as keyof typeof defaultEmojiMap] || '🧩';
  }
  
  /**
   * Get emoji for a cube type for reactions
   * Using standard unicode emojis for reactions since custom emojis require the emoji to be in the server
   */
  private getCubeTypeCustomEmoji(cubeType: string): string {
    // Use the same function as regular emoji for consistency
    return this.getCubeTypeEmoji(cubeType);
  }
  
  /**
   * Find a role by name in a guild and return its ID
   * @param guild The guild to search in
   * @param roleName The name of the role to find (case-insensitive)
   * @returns The role ID if found, or empty string if not found
   */
  private async findRoleId(guild: Guild, roleName: string): Promise<string> {
    let roleId = '';
    
    try {
      // Fetch and cache all roles from the guild
      const roles = await guild.roles.fetch();
      
      // Find the role with a name that matches (case-insensitive)
      const role = roles.find((r: any) => r.name.toLowerCase() === roleName.toLowerCase());
      
      if (role) {
        roleId = role.id;
        console.log(`Found role ID for "${roleName}": ${roleId}`);
      } else {
        console.log(`Role "${roleName}" not found in guild`);
      }
    } catch (error) {
      console.error(`Error finding role "${roleName}":`, error);
    }
    
    return roleId;
  }
  
  /**
   * Initialize the Discord bot with connection retry logic
   * @param token The Discord bot token
   */
  async initialize(token: string) {
    if (!token) {
      throw new Error('DISCORD_TOKEN is required to initialize the bot');
    }
    
    // Store token for reconnection attempts
    this._token = token;
    
    // Set initial retry delay to 1 second
    this._retryDelay = 1000;
    
    // Set max retry attempts (0 = infinite attempts)
    this._maxRetries = 0;
    
    // Reset retry counter
    this._retryCount = 0;
    
    // Try to connect
    await this._connect();
    console.log('Discord bot initialized with 24/7 uptime capabilities');
  }
  
  // Private token storage for reconnection
  private _token: string = '';
  
  // Retry parameters
  private _retryDelay: number = 1000;
  private _maxRetries: number = 0;
  private _retryCount: number = 0;
  private _reconnecting: boolean = false;
  
  /**
   * Internal connection method with retry logic
   * @private
   */
  private async _connect(): Promise<void> {
    try {
      if (this._reconnecting) {
        console.log(`Attempting to reconnect (attempt ${this._retryCount + 1})...`);
      }
      
      await this.client.login(this._token);
      
      // Reset retry parameters on successful connection
      this._retryDelay = 1000;
      this._retryCount = 0;
      this._reconnecting = false;
      
      console.log('Discord bot connected successfully');
    } catch (error) {
      console.error('Failed to connect to Discord:', error);
      
      // Increment retry counter
      this._retryCount++;
      
      // Stop trying if max retries is reached and it's not infinite (0)
      if (this._maxRetries > 0 && this._retryCount >= this._maxRetries) {
        console.error(`Maximum retry attempts (${this._maxRetries}) reached. Giving up.`);
        throw new Error('Failed to connect to Discord after maximum retry attempts');
      }
      
      // Exponential backoff with jitter for retry
      const jitter = Math.random() * 0.3 * this._retryDelay;
      const delay = this._retryDelay + jitter;
      
      console.log(`Retrying connection in ${Math.floor(delay / 1000)} seconds...`);
      
      // Mark as reconnecting
      this._reconnecting = true;
      
      // Schedule retry
      setTimeout(() => {
        // Increase delay for next retry (cap at 5 minutes)
        this._retryDelay = Math.min(this._retryDelay * 1.5, 300000);
        
        // Try to connect again
        this._connect().catch(e => console.error('Reconnection attempt failed:', e));
      }, delay);
    }
  }
  
  /**
   * Check if the bot client is ready
   */
  isClientReady(): boolean {
    return this.isReady;
  }
  
  /**
   * Get a guild by ID (for administrative functions)
   * @param guildId The Discord guild ID
   */
  async getGuild(guildId: string) {
    return await this.client.guilds.fetch(guildId);
  }
  
  /**
   * Fetch a channel by guild ID and channel ID (for administrative functions)
   * @param guildId The Discord guild ID
   * @param channelId The Discord channel ID
   */
  async getChannel(guildId: string, channelId: string): Promise<TextChannel | null> {
    try {
      const guild = await this.getGuild(guildId);
      const channel = await guild.channels.fetch(channelId) as TextChannel;
      return channel;
    } catch (error) {
      console.error(`Error fetching channel ${channelId} in guild ${guildId}:`, error);
      return null;
    }
  }
  
  /**
   * Send an emergency notification to a channel
   * @param guildId The Discord guild ID
   * @param channelId The Discord channel ID 
   * @param content The message content
   */
  async sendEmergencyNotification(guildId: string, channelId: string, content: string): Promise<boolean> {
    try {
      const channel = await this.getChannel(guildId, channelId);
      if (channel) {
        await channel.send({ content });
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error sending emergency notification to ${channelId} in guild ${guildId}:`, error);
      return false;
    }
  }
  
  /**
   * Check if today is April 1st (April Fools Day)
   * @returns boolean indicating if today is April Fools Day
   */
  private isAprilFoolsDay(): boolean {
    const today = new Date();
    const month = today.getMonth(); // 0-indexed, so April is 3
    const day = today.getDate();
    
    return (month === 3 && day === 1);
  }
  
  /**
   * Create a daily scramble thread in the specified channel
   * @param config The bot configuration
   */
  async createDailyScrambleThread(config: BotConfig): Promise<void> {
    if (!this.isReady) {
      throw new Error('Discord client is not ready yet');
    }
    
    try {
      console.log(`Attempting to create daily scramble thread in guild ${config.guildId}, channel ${config.channelId}`);
      
      // Get the guild with error handling
      let guild;
      try {
        guild = await this.client.guilds.fetch(config.guildId);
        console.log(`Successfully fetched guild: ${guild.name}`);
      } catch (error) {
        console.error(`Failed to fetch guild with ID ${config.guildId}:`, error);
        throw new Error(`Guild not found or bot doesn't have access to guild with ID ${config.guildId}`);
      }
      
      // Get the channel with error handling
      let channel;
      try {
        channel = await guild.channels.fetch(config.channelId) as TextChannel;
        console.log(`Successfully fetched channel: ${channel.name}`);
      } catch (error) {
        console.error(`Failed to fetch channel with ID ${config.channelId}:`, error);
        throw new Error(`Channel not found or bot doesn't have access to channel with ID ${config.channelId}`);
      }
      
      // Verify channel is a text channel
      if (!channel || channel.type !== 0) { // 0 is GUILD_TEXT
        console.error(`Channel ${config.channelId} is not a text channel, type:`, channel?.type);
        throw new Error(`Channel ${config.channelId} is not a text channel`);
      }
      
      // Generate the thread title and content
      const threadTitle = scrambleManager.generateThreadTitle();
      const threadContent = scrambleManager.generateThreadContent();
      console.log(`Generated thread title: ${threadTitle}`);
      
      // Create the thread with enhanced error handling
      let message;
      try {
        // Find the 'daily scramble ping' role in the guild
        const pingRoleName = 'daily scramble ping';
        const pingRoleId = await this.findRoleId(guild, pingRoleName);
        
        console.log(`Found role ID for "daily scramble ping": ${pingRoleId}`);
        
        // Create a simple message for the thread
        message = await channel.send({ content: `Daily Scramble Challenge` });
        console.log(`Successfully sent initial message to channel`);
      } catch (error) {
        console.error('Failed to send message to channel:', error);
        throw new Error(`Bot doesn't have permission to send messages in channel ${config.channelId}`);
      }
      
      // Start the thread
      let thread;
      try {
        thread = await message.startThread({
          name: threadTitle,
          autoArchiveDuration: 1440, // 24 hours
        });
        console.log(`Successfully created thread: ${thread.id}`);
      } catch (error) {
        console.error('Failed to create thread:', error);
        throw new Error(`Bot doesn't have permission to create threads in channel ${config.channelId}`);
      }
      
      // Send content to the thread
      let threadMessage;
      try {
        // Find the 'daily scramble ping' role in the guild
        const pingRoleName = 'daily scramble ping';
        const pingRoleId = await this.findRoleId(guild, pingRoleName);
        
        // Create a modified thread content that includes the role ping
        let modifiedThreadContent = threadContent;
        
        // If we found the role ID, replace the placeholder with the actual role mention
        if (pingRoleId) {
          modifiedThreadContent = threadContent.replace(
            '||@daily scramble ping||',
            `<@&${pingRoleId}>`
          );
        } else {
          // Otherwise, just remove the placeholder
          modifiedThreadContent = threadContent.replace('||@daily scramble ping||', '');
        }
        
        threadMessage = await thread.send(modifiedThreadContent);
        console.log(`Successfully sent content to thread`);
        
        // Add emoji reaction based on cube type
        const cubeType = scrambleManager.getCubeTypeForDay();
        const emojiName = this.getCubeTypeCustomEmoji(cubeType);
        
        if (emojiName) {
          try {
            await threadMessage.react(emojiName);
            console.log(`Added reaction emoji ${emojiName} to thread message`);
          } catch (reactionError) {
            console.error(`Failed to add emoji reaction ${emojiName}:`, reactionError);
            // Don't throw here, continue execution
          }
        }
        
        // Special April Fools message (only when April Fools method returns true)
        if (this.isAprilFoolsDay()) {
          console.log("🎭 It's April Fools Day! Sending Rick Roll message...");
          
          // Wait a moment before sending the Rick Roll
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Create a fancy embed for the Rick Roll
          const aprilFoolsEmbed = new EmbedBuilder()
            .setTitle('🎵 Never Gonna Give You Up 🎵')
            .setDescription(
              "We're no strangers to puzzles,\n" +
              "You know the rules, and so do I!\n" +
              "A full commitment's what I'm thinking of,\n" +
              "You wouldn't get this from any other bot!\n\n" +
              "Happy April Fools from the Speedcubing Community! 🎉"
            )
            .setColor(0xFF3366)
            .setImage('https://media.giphy.com/media/g7GKcSzwQfugw/giphy.gif')
            .setFooter({ text: 'Never gonna cube you up, never gonna solve you down!' });
            
          await thread.send({ embeds: [aprilFoolsEmbed] });
          
          // Add a follow-up message with a special "Rick Roll" scramble
          await thread.send({
            content: "**APRIL FOOLS BONUS SCRAMBLE:**\n" +
                    "```\nR I C K R O L L D R' U' B' F' L' D' Y'\n```\n" +
                    "(Just for fun! Use the real scramble above for today's challenge 😄)"
          });
        }
      } catch (error) {
        console.error('Failed to send message to thread:', error);
        // Don't throw here, we already created the thread
      }
      
      // Calculate expiration time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + config.deleteAfterHours);
      
      // Get the cube type for today
      const cubeType = scrambleManager.getCubeTypeForDay();
      console.log(`Today's cube type: ${cubeType}`);
      
      // Extract scramble text
      let scrambleText;
      try {
        scrambleText = threadContent.split('```')[1].trim();
      } catch (error: any) {
        scrambleText = "Error extracting scramble text";
        console.error('Error extracting scramble text:', error);
      }
      
      // Store the thread information in the database
      const threadData: InsertChallengeThread = {
        threadId: thread.id,
        channelId: channel.id,
        guildId: guild.id,
        cubeType,
        scramble: scrambleText,
        expiresAt
      };
      
      try {
        await storage.createChallengeThread(threadData);
        console.log(`Successfully stored thread data in database`);
      } catch (error) {
        console.error('Failed to store thread data in database:', error);
        // Don't throw here, the thread is already created
      }
      
      console.log(`Successfully created daily scramble thread: ${threadTitle}`);
    } catch (error) {
      console.error('Error creating daily scramble thread:', error);
      throw error;
    }
  }
  
  /**
   * Archive a thread that has expired
   * @param thread The thread data to archive
   */
  async archiveThread(thread: ChallengeThread): Promise<void> {
    if (!this.isReady) {
      throw new Error('Discord client is not ready yet');
    }
    
    try {
      // Get the guild and channel
      const guild = await this.client.guilds.fetch(thread.guildId);
      const channel = await guild.channels.fetch(thread.channelId) as TextChannel;
      
      if (!channel) {
        console.warn(`Channel ${thread.channelId} not found, marking thread as archived anyway`);
        return;
      }
      
      try {
        console.log(`Attempting to fetch thread: ${thread.threadId} in channel ${channel.name}`);
        
        // Get all threads in the channel (active and archived)
        let foundThread = null;
        
        // First check active threads
        try {
          const activeThreads = await channel.threads.fetchActive();
          console.log(`Active threads in channel ${channel.name} (${channel.id}): ${activeThreads.threads.size}`);
          
          activeThreads.threads.forEach(t => {
            console.log(`- Active thread: ${t.id} (${t.name})`);
          });
          
          foundThread = activeThreads.threads.get(thread.threadId);
          if (foundThread) {
            console.log(`Found thread ${thread.threadId} in active threads`);
          }
        } catch (activeError) {
          console.error(`Error fetching active threads: ${activeError}`);
        }
        
        // If not found in active, check archived threads
        if (!foundThread) {
          try {
            const archivedThreads = await channel.threads.fetchArchived();
            console.log(`Archived threads in channel ${channel.name}: ${archivedThreads.threads.size}`);
            
            archivedThreads.threads.forEach(t => {
              console.log(`- Archived thread: ${t.id} (${t.name})`);
            });
            
            foundThread = archivedThreads.threads.get(thread.threadId);
            if (foundThread) {
              console.log(`Found thread ${thread.threadId} in archived threads`);
              // Thread is already archived, consider this a success
              return;
            }
          } catch (archivedError) {
            console.error(`Error fetching archived threads: ${archivedError}`);
          }
        }
        
        // If still not found, try fetching directly
        if (!foundThread) {
          try {
            foundThread = await channel.threads.fetch(thread.threadId);
            console.log(`Successfully fetched thread directly: ${thread.threadId}`);
          } catch (directFetchError) {
            console.warn(`Error directly fetching thread ${thread.threadId}: ${directFetchError}`);
          }
        }
        
        // Process the found thread
        if (foundThread) {
          // Send a final message to the thread before archiving
          try {
            await foundThread.send({
              content: `🔒 This thread was closed.`
            });
            console.log(`Sent final message to thread ${thread.threadId}`);
          } catch (messageError) {
            console.warn(`Could not send final message to thread: ${messageError}`);
          }
          
          // First lock the thread to prevent further messages
          try {
            await foundThread.setLocked(true);
            console.log(`Set thread ${thread.threadId} as locked`);
          } catch (lockError) {
            console.warn(`Error setting thread as locked: ${lockError}`);
          }
          
          // Then archive the thread
          try {
            await foundThread.setArchived(true);
            console.log(`Set thread ${thread.threadId} as archived`);
          } catch (archiveError) {
            console.warn(`Error setting thread as archived: ${archiveError}`);
          }
          
          console.log(`Successfully archived expired thread: ${thread.threadId}`);
          return; // Exit if successful
        } else {
          console.warn(`Thread ${thread.threadId} not found in active or archived threads`);
        }
      } catch (error: unknown) {
        // Thread might already be archived or inaccessible
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Thread ${thread.threadId} could not be archived: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error archiving thread:', error);
      throw error;
    }
  }
  
  /**
   * Manually create a scramble thread for a specific cube type
   * @param guildId The ID of the guild
   * @param channelId The ID of the channel
   * @param cubeType The type of cube
   */
  async createManualScrambleThread(guildId: string, channelId: string, cubeType: string): Promise<string> {
    if (!this.isReady) {
      throw new Error('Discord client is not ready yet');
    }
    
    try {
      console.log(`Creating manual scramble thread for ${cubeType} in guild ${guildId}, channel ${channelId}`);
      
      // Get guild and channel
      const guild = await this.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId) as TextChannel;
      
      if (!channel || channel.type !== 0) {
        throw new Error(`Channel ${channelId} is not a text channel or could not be found`);
      }
      
      // Generate scramble for the specific cube type
      const scrambleData = scrambleManager.generateScrambleForType(cubeType);
      const scramble = scrambleData.scramble;
      
      // Create thread title - just the cube type
      const threadTitle = cubeType;
      
      // Find the 'daily scramble ping' role in the guild
      const pingRoleName = 'daily scramble ping';
      const pingRoleId = await this.findRoleId(guild, pingRoleName);
      
      // Create message content
      let content = `Daily Scramble Challenge`;
      
      // Send message and create thread
      const message = await channel.send({ content });
      
      const thread = await message.startThread({
        name: threadTitle,
        autoArchiveDuration: 1440,
      });
      
      // Create thread content with formatted scramble in a box
      const threadContent = `# Today's Daily Scramble!
||@daily scramble ping||

\`\`\`
${scramble}
\`\`\`

Good luck! 🍀`;

      // Handle role pings in the thread content
      let modifiedThreadContent = threadContent;
        
      // If we found the role ID, replace the placeholder with the actual role mention
      if (pingRoleId) {
        modifiedThreadContent = threadContent.replace(
          '||@daily scramble ping||',
          `<@&${pingRoleId}>`
        );
      } else {
        // Otherwise, just remove the placeholder
        modifiedThreadContent = threadContent.replace('||@daily scramble ping||', '');
      }
      
      // Send content to thread with emoji reaction
      let threadMessage = await thread.send(modifiedThreadContent);
      
      // Add emoji reaction based on cube type
      const emojiName = this.getCubeTypeCustomEmoji(cubeType);
      
      if (emojiName) {
        try {
          await threadMessage.react(emojiName);
          console.log(`Added reaction emoji ${emojiName} to manual thread message`);
        } catch (reactionError) {
          console.error(`Failed to add emoji reaction ${emojiName}:`, reactionError);
          // Don't throw here, continue execution
        }
      }
      
      // Special April Fools message for test threads too!
      if (this.isAprilFoolsDay()) {
        console.log("🎭 It's April Fools Day! Sending Rick Roll message in test thread...");
        
        // Wait a moment before sending the Rick Roll
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create a fancy embed for the Rick Roll
        const aprilFoolsEmbed = new EmbedBuilder()
          .setTitle('🎵 Never Gonna Give You Up 🎵')
          .setDescription(
            "We're no strangers to puzzles,\n" +
            "You know the rules, and so do I!\n" +
            "A full commitment's what I'm thinking of,\n" +
            "You wouldn't get this from any other bot!\n\n" +
            "Happy April Fools from the Speedcubing Community! 🎉"
          )
          .setColor(0xFF3366)
          .setImage('https://media.giphy.com/media/g7GKcSzwQfugw/giphy.gif')
          .setFooter({ text: 'Never gonna cube you up, never gonna solve you down!' });
          
        await thread.send({ embeds: [aprilFoolsEmbed] });
        
        // Add a follow-up message with a special "Rick Roll" scramble
        await thread.send({
          content: "**APRIL FOOLS BONUS SCRAMBLE:**\n" +
                  "```\nR I C K R O L L D R' U' B' F' L' D' Y'\n```\n" +
                  "(Just for fun! Use the real scramble above for today's challenge 😄)"
        });
      }
      
      // Calculate expiration time (24 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Default to 24 hours for test threads
      
      // Store the thread information
      const threadData: InsertChallengeThread = {
        threadId: thread.id,
        channelId: channel.id,
        guildId: guild.id,
        cubeType,
        scramble,
        expiresAt
      };
      
      await storage.createChallengeThread(threadData);
      
      return thread.id;
    } catch (error) {
      console.error('Error creating manual scramble thread:', error);
      throw error;
    }
  }
  
  /**
   * Store custom emoji mappings (persisted to file)
   */
  private customEmojiMap: Record<string, string> = {};
  
  /**
   * Load custom emoji mappings from file
   */
  private async loadCustomEmojiMap() {
    try {
      // Import fs with dynamic import for ESM compatibility
      const fs = await import('fs/promises');
      
      try {
        // Check if file exists and read it
        const data = await fs.readFile('./emoji-config.json', 'utf8');
        this.customEmojiMap = JSON.parse(data);
        console.log('Loaded custom emoji mappings from file:', this.customEmojiMap);
      } catch (fileError) {
        // File doesn't exist or can't be read
        if ((fileError as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log('No custom emoji config file found, using defaults');
        } else {
          throw fileError;
        }
      }
    } catch (error) {
      console.error('Error loading custom emoji mappings:', error);
      // Continue with empty map if file can't be loaded
    }
  }
  
  /**
   * Save custom emoji mappings to file
   */
  private async saveCustomEmojiMap() {
    try {
      // Import fs with dynamic import for ESM compatibility
      const fs = await import('fs/promises');
      
      await fs.writeFile('./emoji-config.json', JSON.stringify(this.customEmojiMap, null, 2));
      console.log('Saved custom emoji mappings to file');
    } catch (error) {
      console.error('Error saving custom emoji mappings:', error);
    }
  }

  /**
   * Handle the /scramble command to generate a random scramble for a cube type and track time
   */
  private async handleScrambleCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get the cube type from the options
      const cubeType = interaction.options.getString('cube_type', true);
      
      // Generate a scramble for the selected cube type
      const scrambleResult = scrambleManager.generateScrambleForType(cubeType);
      
      // Create a rich embed for the scramble
      const scrambleEmbed = new EmbedBuilder()
        .setTitle(`${this.getCubeTypeEmoji(cubeType)} Random ${cubeType} Scramble`)
        .setColor(0x3498DB)
        .setDescription(`Here's your random scramble for ${cubeType}:`)
        .addFields(
          { 
            name: 'Scramble', 
            value: `\`\`\`\n${scrambleResult.scramble}\n\`\`\``, 
            inline: false 
          },
          {
            name: 'How to use',
            value: 'Apply this scramble to your cube and time your solve. Good luck! 🍀',
            inline: false
          }
        )
        .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
      
      // Create buttons for time tracking
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('timer_ready')
            .setLabel('Start Timer')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏱️'),
          new ButtonBuilder()
            .setCustomId('timer_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );
      
      // Send the embed with buttons
      const response = await interaction.editReply({ 
        embeds: [scrambleEmbed],
        components: [row]
      });
      
      // Create a collector for button interactions
      const collector = response.createMessageComponentCollector({ 
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
      });
      
      // Timer state
      let timerActive = false;
      let startTime = 0;
      
      // Handle button interactions
      collector.on('collect', async i => {
        try {
          if (i.customId === 'timer_ready' && !timerActive) {
            // Start timer
            timerActive = true;
            startTime = Date.now();
            
            // Update buttons to show stop option
            const timerRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('timer_stop')
                  .setLabel('Stop Timer')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('⏹️'),
                new ButtonBuilder()
                  .setCustomId('timer_cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            await i.update({ components: [timerRow] });
          } 
          else if (i.customId === 'timer_stop' && timerActive) {
            // Stop timer and calculate elapsed time
            const endTime = Date.now();
            const elapsedTime = (endTime - startTime) / 1000; // Convert to seconds
            timerActive = false;
            
            // Format time
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;
            const formattedTime = `${minutes > 0 ? `${minutes}m ` : ''}${seconds.toFixed(2)}s`;
            
            // Update embed with time result
            const resultEmbed = new EmbedBuilder()
              .setTitle(`${this.getCubeTypeEmoji(cubeType)} ${cubeType} Solve Complete!`)
              .setColor(0x2ECC71)
              .setDescription(`Congratulations on completing your solve!`)
              .addFields(
                { 
                  name: 'Scramble Used', 
                  value: `\`\`\`\n${scrambleResult.scramble}\n\`\`\``, 
                  inline: false 
                },
                {
                  name: '⏱️ Your Time',
                  value: `**${formattedTime}**`,
                  inline: true
                },
                {
                  name: '🏆 Solve Rating',
                  value: this.getSolveRating(elapsedTime),
                  inline: true
                }
              )
              .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
            
            // New row with option to get another scramble
            const newRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('new_scramble')
                  .setLabel('New Scramble')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔄')
              );
            
            await i.update({ 
              embeds: [resultEmbed],
              components: [newRow]
            });
          }
          else if (i.customId === 'new_scramble') {
            // Generate a new scramble for the same cube type
            const newScrambleResult = scrambleManager.generateScrambleForType(cubeType);
            
            // Create a new embed for the scramble
            const newScrambleEmbed = new EmbedBuilder()
              .setTitle(`${this.getCubeTypeEmoji(cubeType)} New ${cubeType} Scramble`)
              .setColor(0x3498DB)
              .setDescription(`Here's your new random scramble for ${cubeType}:`)
              .addFields(
                { 
                  name: 'Scramble', 
                  value: `\`\`\`\n${newScrambleResult.scramble}\n\`\`\``, 
                  inline: false 
                },
                {
                  name: 'How to use',
                  value: 'Apply this scramble to your cube and time your solve. Good luck! 🍀',
                  inline: false
                }
              )
              .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
            
            // Reset the timer buttons
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('timer_ready')
                  .setLabel('Start Timer')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('⏱️'),
                new ButtonBuilder()
                  .setCustomId('timer_cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            // End the old collector
            collector.stop();
            
            // Send the new embed with buttons
            const newResponse = await i.update({ 
              embeds: [newScrambleEmbed],
              components: [row]
            });
            
            // Create a new collector for the new scramble
            const newCollector = (i.message as Message).createMessageComponentCollector({ 
              filter: j => j.user.id === interaction.user.id,
              time: 300000 // 5 minutes
            });
            
            // Set up the new collector with the same logic
            newCollector.on('collect', async j => {
              try {
                if (j.customId === 'timer_ready' && !timerActive) {
                  // Start timer
                  timerActive = true;
                  startTime = Date.now();
                  
                  // Update buttons to show stop option
                  const timerRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId('timer_stop')
                        .setLabel('Stop Timer')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏹️'),
                      new ButtonBuilder()
                        .setCustomId('timer_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                    );
                  
                  await j.update({ components: [timerRow] });
                } 
                else if (j.customId === 'timer_stop' && timerActive) {
                  // Handle the timer stop
                  const endTime = Date.now();
                  const elapsedTime = (endTime - startTime) / 1000; // Convert to seconds
                  timerActive = false;
                  
                  // Format time
                  const minutes = Math.floor(elapsedTime / 60);
                  const seconds = elapsedTime % 60;
                  const formattedTime = `${minutes > 0 ? `${minutes}m ` : ''}${seconds.toFixed(2)}s`;
                  
                  // Update embed with time result
                  const resultEmbed = new EmbedBuilder()
                    .setTitle(`${this.getCubeTypeEmoji(cubeType)} ${cubeType} Solve Complete!`)
                    .setColor(0x2ECC71)
                    .setDescription(`Congratulations on completing your solve!`)
                    .addFields(
                      { 
                        name: 'Scramble Used', 
                        value: `\`\`\`\n${newScrambleResult.scramble}\n\`\`\``, 
                        inline: false 
                      },
                      {
                        name: '⏱️ Your Time',
                        value: `**${formattedTime}**`,
                        inline: true
                      },
                      {
                        name: '🏆 Solve Rating',
                        value: this.getSolveRating(elapsedTime),
                        inline: true
                      }
                    )
                    .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
                  
                  // New row with option to get another scramble
                  const newRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId('new_scramble')
                        .setLabel('New Scramble')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                    );
                  
                  await j.update({ 
                    embeds: [resultEmbed],
                    components: [newRow]
                  });
                }
                else if (j.customId === 'timer_cancel') {
                  // Cancel timer
                  timerActive = false;
                  newCollector.stop();
                  
                  await j.update({ 
                    components: [] 
                  });
                }
              } catch (error) {
                console.error('Error handling timer button interaction:', error);
              }
            });
            
            newCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                try {
                  await (i.message as Message).edit({ components: [] });
                } catch (error) {
                  console.error('Error removing buttons after collector end:', error);
                }
              }
            });
          }
          else if (i.customId === 'timer_cancel') {
            // Cancel timer
            timerActive = false;
            collector.stop();
            
            await i.update({ 
              components: [] 
            });
          }
        } catch (error) {
          console.error('Error handling timer button interaction:', error);
        }
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await interaction.editReply({ components: [] });
          } catch (error) {
            console.error('Error removing buttons after collector end:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error handling scramble command:', error);
      try {
        await interaction.editReply('An error occurred while generating the scramble. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
  
  /**
   * Handle the /custom-scramble command to generate a custom scramble with specific parameters
   */
  private async handleCustomScrambleCommand(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      
      // Get parameters from the options
      const cubeType = interaction.options.getString('cube_type', true);
      const moves = interaction.options.getInteger('moves') || undefined;
      const difficulty = interaction.options.getString('difficulty') || 'medium';
      
      // Generate a custom scramble for the selected cube type
      const scrambleResult = scrambleManager.generateCustomScrambleForType(cubeType, moves, difficulty);
      
      // Create a rich embed for the custom scramble
      const scrambleEmbed = new EmbedBuilder()
        .setTitle(`${this.getCubeTypeEmoji(cubeType)} Custom ${cubeType} Scramble`)
        .setColor(0x9C59B6) // Different color for custom scrambles
        .setDescription(`Here's your custom ${difficulty} difficulty scramble for ${cubeType}:`)
        .addFields(
          { 
            name: 'Scramble', 
            value: `\`\`\`\n${scrambleResult.scramble}\n\`\`\``, 
            inline: false 
          },
          {
            name: 'Parameters',
            value: `• Cube Type: ${cubeType}\n• Difficulty: ${difficulty}${moves ? `\n• Moves: ${moves}` : ''}`,
            inline: true
          },
          {
            name: 'How to use',
            value: 'Apply this scramble to your cube and time your solve. Good luck! 🍀',
            inline: true
          }
        )
        .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
      
      // Create buttons for time tracking
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('timer_ready')
            .setLabel('Start Timer')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏱️'),
          new ButtonBuilder()
            .setCustomId('timer_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );
      
      // Send the embed with buttons
      const response = await interaction.editReply({ 
        embeds: [scrambleEmbed],
        components: [row]
      });
      
      // Create a collector for button interactions
      const collector = response.createMessageComponentCollector({ 
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
      });
      
      // Timer state
      let timerActive = false;
      let startTime = 0;
      
      // Handle button interactions
      collector.on('collect', async i => {
        try {
          if (i.customId === 'timer_ready' && !timerActive) {
            // Start timer
            timerActive = true;
            startTime = Date.now();
            
            // Update buttons to show stop option
            const timerRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('timer_stop')
                  .setLabel('Stop Timer')
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji('⏹️'),
                new ButtonBuilder()
                  .setCustomId('timer_cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            await i.update({ components: [timerRow] });
          } 
          else if (i.customId === 'timer_stop' && timerActive) {
            // Stop timer and calculate elapsed time
            const endTime = Date.now();
            const elapsedTime = (endTime - startTime) / 1000; // Convert to seconds
            timerActive = false;
            
            // Format time
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;
            const formattedTime = `${minutes > 0 ? `${minutes}m ` : ''}${seconds.toFixed(2)}s`;
            
            // Update embed with time result
            const resultEmbed = new EmbedBuilder()
              .setTitle(`${this.getCubeTypeEmoji(cubeType)} ${cubeType} Solve Complete!`)
              .setColor(0x2ECC71)
              .setDescription(`Congratulations on completing your custom scramble solve!`)
              .addFields(
                { 
                  name: 'Scramble Used', 
                  value: `\`\`\`\n${scrambleResult.scramble}\n\`\`\``, 
                  inline: false 
                },
                {
                  name: 'Parameters',
                  value: `• Cube Type: ${cubeType}\n• Difficulty: ${difficulty}${moves ? `\n• Moves: ${moves}` : ''}`,
                  inline: false
                },
                {
                  name: '⏱️ Your Time',
                  value: `**${formattedTime}**`,
                  inline: true
                },
                {
                  name: '🏆 Solve Rating',
                  value: this.getSolveRating(elapsedTime),
                  inline: true
                }
              )
              .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
            
            // New row with option to get another scramble
            const newRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('new_custom_scramble')
                  .setLabel('New Custom Scramble')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔄')
              );
            
            await i.update({ 
              embeds: [resultEmbed],
              components: [newRow]
            });
          }
          else if (i.customId === 'new_custom_scramble') {
            // Generate a new custom scramble with the same parameters
            const newScrambleResult = scrambleManager.generateCustomScrambleForType(cubeType, moves, difficulty);
            
            // Create a new embed for the scramble
            const newScrambleEmbed = new EmbedBuilder()
              .setTitle(`${this.getCubeTypeEmoji(cubeType)} New Custom ${cubeType} Scramble`)
              .setColor(0x9C59B6)
              .setDescription(`Here's your new custom ${difficulty} difficulty scramble for ${cubeType}:`)
              .addFields(
                { 
                  name: 'Scramble', 
                  value: `\`\`\`\n${newScrambleResult.scramble}\n\`\`\``, 
                  inline: false 
                },
                {
                  name: 'Parameters',
                  value: `• Cube Type: ${cubeType}\n• Difficulty: ${difficulty}${moves ? `\n• Moves: ${moves}` : ''}`,
                  inline: true
                },
                {
                  name: 'How to use',
                  value: 'Apply this scramble to your cube and time your solve. Good luck! 🍀',
                  inline: true
                }
              )
              .setFooter({ text: `Daily Scramble Bot • ${new Date().toLocaleString()}` });
            
            // Reset the timer buttons
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('timer_ready')
                  .setLabel('Start Timer')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('⏱️'),
                new ButtonBuilder()
                  .setCustomId('timer_cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('❌')
              );
            
            // End the old collector
            collector.stop();
            
            // Send the new embed with buttons
            await i.update({ 
              embeds: [newScrambleEmbed],
              components: [row]
            });
          }
          else if (i.customId === 'timer_cancel') {
            // Cancel timer
            timerActive = false;
            collector.stop();
            
            await i.update({ 
              components: [] 
            });
          }
        } catch (error) {
          console.error('Error handling timer button interaction:', error);
        }
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await interaction.editReply({ components: [] });
          } catch (error) {
            console.error('Error removing buttons after collector end:', error);
          }
        }
      });
    } catch (error) {
      console.error('Error handling custom scramble command:', error);
      try {
        await interaction.editReply('An error occurred while generating the custom scramble. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }

  /**
   * Get a rating for a solve time (just for fun)
   * @param time The solve time in seconds
   * @returns A fun rating message based on the time
   */
  private getSolveRating(time: number): string {
    // Different ratings based on the cube type could be implemented in the future
    if (time < 10) return "🔥 Speedcubing Champion! 🔥";
    if (time < 20) return "⚡ Lightning Fast! ⚡";
    if (time < 30) return "🌟 Outstanding! 🌟";
    if (time < 45) return "👏 Great Solve! 👏";
    if (time < 60) return "👍 Solid Effort! 👍";
    if (time < 90) return "🙂 Good Progress! 🙂";
    if (time < 120) return "💪 Keep Practicing! 💪";
    return "🎮 Cube Solver! 🎮";
  }
  
  /**
   * Handle the /react_emoji command to set custom emoji reactions for cube types
   * Only allows users with the "Owner{Pin if problem.}" role to use this command
   */
  private async handleReactEmojiCommand(interaction: ChatInputCommandInteraction) {
    console.log(`handleReactEmojiCommand called by ${interaction.user.tag}`);
    try {
      // Defer the reply immediately to prevent timeout
      await interaction.deferReply();
      console.log('Reply deferred to prevent timeout');
      
      // First, check if the user has the required role
      if (!interaction.inGuild()) {
        console.log('Command used outside of a guild');
        await interaction.editReply('This command can only be used in a server.');
        return;
      }
      
      console.log('Checking user roles...');
      // Check if the user has the "Owner{Pin if problem.}" role or is an Administrator
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      
      // Log all roles the user has
      console.log(`User ${interaction.user.tag} has roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
      
      // Check if user has the Owner role or has Administrator permissions
      const isOwner = member.roles.cache.some(
        role => role.name === 'Owner{Pin if problem.}'
      );
      
      const isAdmin = member.permissions.has('Administrator');
      
      // Check for specific allowed user
      const isSpecificUser = interaction.user.username === 'sachitshah_63900';
      
      const hasRequiredPermission = isOwner || isAdmin || isSpecificUser;
      
      console.log(`User permissions - Is Owner: ${isOwner}, Is Admin: ${isAdmin}, Is Specific User: ${isSpecificUser}, Has required permission: ${hasRequiredPermission}`);
      
      if (!hasRequiredPermission) {
        await interaction.editReply(
          'You need the "Owner{Pin if problem.}" role, Administrator permissions, or be a specifically allowed user to use this command.'
        );
        return;
      }
      
      // Get the command options
      const cubeType = interaction.options.getString('cube_type', true);
      const emoji = interaction.options.getString('emoji', true);
      
      // Enhanced emoji validation with better detection and feedback
      console.log(`Validating emoji: "${emoji}" (length: ${emoji.length})`);
      
      // Check for empty
      if (emoji.trim().length === 0) {
        console.log('Emoji validation failed: empty');
        await interaction.editReply('Invalid emoji format. Please provide a valid emoji.');
        return;
      }
      
      // Check if it's a custom Discord emoji (format: <:name:id> or <a:name:id> for animated)
      const customEmojiRegex = /<a?:.+?:\d+>/;
      const isCustomEmoji = customEmojiRegex.test(emoji);
      
      if (isCustomEmoji) {
        console.log('Custom Discord emoji detected:', emoji);
        
        // Extract emoji ID to verify it's a valid format
        const emojiIdMatch = emoji.match(/:\d+>/);
        if (!emojiIdMatch) {
          console.log('Custom emoji format validation failed: missing ID');
          await interaction.editReply('Invalid custom emoji format. Please use a valid Discord custom emoji.');
          return;
        }
        
        // Verify this is a custom emoji from a server the bot has access to
        try {
          // Try to find the emoji in the cache to verify bot has access
          const emojiId = emoji.split(':').pop()?.replace('>', '') || '';
          const guildEmojis = this.client.emojis.cache;
          const emojiExists = guildEmojis.has(emojiId);
          
          if (!emojiExists) {
            // Even if not found in cache, we'll allow it but warn the user
            await interaction.followUp({
              content: '⚠️ Warning: This custom emoji might not be from a server the bot has access to. If reactions fail, try using a standard emoji instead.',
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              content: '✅ Custom emoji validated successfully.',
              ephemeral: true
            });
          }
        } catch (emojiCheckError) {
          console.error('Error checking emoji availability:', emojiCheckError);
          // Continue anyway, but warn the user
          await interaction.followUp({
            content: '⚠️ Warning: Could not verify custom emoji access. If reactions fail, try using a standard emoji instead.',
            ephemeral: true
          });
        }
      } else {
        // It should be a standard Unicode emoji
        
        // Simple length-based check (most Unicode emojis are 1-2 code points)
        if (emoji.length > 10) {
          console.log('Emoji validation failed: too long for standard emoji');
          await interaction.editReply('Invalid emoji format. Please provide a single standard Unicode emoji or a custom Discord emoji.');
          return;
        }
        
        // Check if emoji might be valid by looking for non-ASCII characters
        // This is a simple heuristic, not perfect but catches basic issues
        const hasNonAscii = emoji.split('').some(char => char.charCodeAt(0) > 127);
        const looksLikeEmoji = hasNonAscii;
        
        if (!looksLikeEmoji) {
          // Even if it doesn't look like a standard emoji, we'll allow it but warn
          await interaction.followUp({
            content: '⚠️ Warning: This doesn\'t appear to be a standard emoji. It might not work properly for reactions.',
            ephemeral: true
          });
        }
      }
      
      console.log('Emoji validation passed, proceeding with emoji:', emoji);
      
      // Update the custom emoji map with the new emoji
      this.customEmojiMap[cubeType] = emoji;
      
      // Save the updated emoji map to file (async operation)
      try {
        await this.saveCustomEmojiMap();
      } catch (saveError) {
        console.error('Error saving emoji map:', saveError);
        // Continue anyway since the emoji is already in memory
      }
      
      // Get the default emoji map
      const defaultEmojiMap = {
        'Skewb': '🔷',
        '3x3 BLD': '🧠',
        '2x2': '🟨',
        '3x3': '🟦',
        'Pyraminx': '🔺',
        '3x3 OH': '🤚',
        'Clock': '🕙'
      };
      
      // Create a combined map for display purposes
      const combinedMap = { ...defaultEmojiMap, ...this.customEmojiMap };
      
      // Create response embed with table of current emoji mappings
      const emojiTable = Object.entries(combinedMap)
        .map(([type, emoji]) => `${type}: ${emoji}${type === cubeType ? ' ← Updated!' : ''}`)
        .join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('🧩 Cube Type Emoji Configuration')
        .setDescription(`Successfully updated emoji for **${cubeType}** to ${emoji}`)
        .addFields({
          name: 'Current Emoji Mappings',
          value: emojiTable
        })
        .setColor(0x2ECC71)
        .setFooter({ text: `Updated by ${interaction.user.tag}` });
      
      await interaction.editReply({ embeds: [embed] });
      
      console.log(`Emoji for ${cubeType} updated to ${emoji} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error handling react_emoji command:', error);
      try {
        await interaction.editReply('An error occurred while updating the emoji configuration. Please try again later.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }
  
  /**
   * Shutdown the bot client with graceful cleanup
   */
  async shutdown() {
    console.log('Initiating graceful shutdown sequence for Discord bot...');
    
    // Clear any pending reconnect attempts
    if (this._reconnecting) {
      console.log('Cancelling any pending reconnection attempts');
      this._reconnecting = false;
    }
    
    // Set status to offline before destroying
    try {
      if (this.client?.isReady()) {
        console.log('Setting bot status to offline/invisible before shutdown');
        await this.client.user?.setPresence({
          status: 'invisible',
          activities: []
        });
      }
    } catch (error) {
      console.warn('Error setting offline status during shutdown:', error);
    }
    
    // Mark as not ready
    this.isReady = false;
    
    // Destroy the client connection
    if (this.client) {
      try {
        await this.client.destroy();
        console.log('Discord client connection destroyed successfully');
      } catch (error) {
        console.error('Error during client destroy operation:', error);
      }
    }
    
    // Reset connection parameters
    this._token = '';
    this._retryCount = 0;
    this._retryDelay = 1000;
    
    console.log('Discord bot has been completely shut down');
  }
}

export const discordBot = new DiscordBot();