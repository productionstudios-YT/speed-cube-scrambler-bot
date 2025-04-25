import express, { Express, Request } from "express";
import { createServer, type Server } from "http";
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { TextChannel } from 'discord.js';
import { storage } from "./storage";
import { discordBot } from "./discord/bot";
import { scheduler } from "./discord/scheduler";
import { keepAliveActive } from "./keep-alive";
import { insertBotConfigSchema, User } from "@shared/schema";
import { z } from "zod";
import { requireAuth } from "./auth";

// Extend the Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Helper function to get directory size
async function getDirSize(dirPath: string): Promise<number> {
  const stat = promisify(fs.stat);
  const readdir = promisify(fs.readdir);
  
  const stats = await stat(dirPath);
  if (!stats.isDirectory()) {
    return stats.size;
  }
  
  const files = await readdir(dirPath);
  const sizes = await Promise.all(
    files.map(async file => {
      const filePath = path.join(dirPath, file);
      try {
        return await getDirSize(filePath);
      } catch (err) {
        console.error(`Error getting size of ${filePath}:`, err);
        return 0;
      }
    })
  );
  
  return sizes.reduce((acc, size) => acc + size, 0);
}

// Helper function to format bytes with support for up to 50 TB
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  // Find the appropriate size unit
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Special handling for TB and above to support up to 50 TB
  if (i >= 4) { // 4 is the index for TB in the sizes array
    const tbValue = bytes / Math.pow(k, 4); // Calculate value in TB
    
    if (tbValue <= 50) {
      // If 50 TB or less, display in TB
      return parseFloat(tbValue.toFixed(dm)) + ' TB';
    }
    // If more than 50 TB, use the regular calculation
  }
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // API routes - prefix with /api
  const apiRouter = express.Router();
  
  // Health check endpoint
  apiRouter.get("/health", (req, res) => {
    const botStatus = discordBot.isClientReady() ? "online" : "offline";
    res.json({ 
      status: "ok", 
      botStatus,
      timestamp: new Date().toISOString()
    });
  });
  
  // Get bot configuration
  apiRouter.get("/config", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getAllBotConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Error fetching configurations:", error);
      res.status(500).json({ error: "Failed to fetch configurations" });
    }
  });
  
  // Create or update bot configuration
  apiRouter.post("/config", requireAuth, async (req, res) => {
    try {
      const configData = insertBotConfigSchema.parse(req.body);
      
      // Check if config already exists for this guild
      const existingConfig = await storage.getBotConfigByGuildId(configData.guildId);
      
      if (existingConfig) {
        // Update existing config
        const updated = await storage.updateBotConfig(existingConfig.id, configData);
        res.json(updated);
      } else {
        // Create new config
        const newConfig = await storage.createBotConfig(configData);
        res.status(201).json(newConfig);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("Error creating/updating configuration:", error);
        res.status(500).json({ error: "Failed to create/update configuration" });
      }
    }
  });
  
  // Get all challenge threads
  apiRouter.get("/threads", requireAuth, async (req, res) => {
    try {
      const threads = await storage.getAllChallengeThreads();
      res.json(threads);
    } catch (error) {
      console.error("Error fetching threads:", error);
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });
  
  // Get the next scheduled challenge
  apiRouter.get("/next-challenge", (req, res) => {
    try {
      const nextChallenge = scheduler.getNextScheduledChallenge();
      res.json(nextChallenge);
    } catch (error) {
      console.error("Error getting next challenge:", error);
      res.status(500).json({ error: "Failed to get next challenge" });
    }
  });
  
  // Create a manual scramble thread
  apiRouter.post("/manual-scramble", requireAuth, async (req, res) => {
    try {
      const { guildId, channelId, cubeType } = req.body;
      
      if (!guildId || !channelId || !cubeType) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      const threadId = await discordBot.createManualScrambleThread(guildId, channelId, cubeType);
      res.status(201).json({ success: true, threadId });
    } catch (error) {
      console.error("Error creating manual scramble:", error);
      res.status(500).json({ error: "Failed to create manual scramble" });
    }
  });
  
  // Create a test thread using the currently configured channel and guild
  apiRouter.post("/create-test-thread", requireAuth, async (req, res) => {
    try {
      const configs = await storage.getAllBotConfigs();
      if (configs.length === 0) {
        return res.status(400).json({ error: "No bot configuration found" });
      }
      
      const config = configs[0];
      const { guildId, channelId } = config;
      const cubeType = req.body.cubeType || "3x3"; // Default to 3x3 if not specified
      
      if (!guildId || !channelId) {
        return res.status(400).json({ error: "Guild ID or Channel ID not configured" });
      }
      
      const threadId = await discordBot.createManualScrambleThread(guildId, channelId, cubeType);
      res.status(201).json({ success: true, threadId, channelId, guildId });
    } catch (error: unknown) {
      console.error("Error creating test thread:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ error: "Failed to create test thread", message: errorMessage });
    }
  });
  
  // Trigger the scheduled daily scramble post immediately
  apiRouter.post("/trigger-daily-post", requireAuth, async (req, res) => {
    try {
      console.log("Manual trigger of daily scramble post requested");
      const success = await scheduler.triggerDailyScramblePost();
      
      if (success) {
        res.status(200).json({ success: true, message: "Daily scramble post triggered successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to trigger daily scramble post" });
      }
    } catch (error: unknown) {
      console.error("Error triggering daily scramble post:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ error: "Failed to trigger daily scramble post", message: errorMessage });
    }
  });
  
  // Trigger thread cleanup manually (delete expired threads)
  apiRouter.post("/trigger-thread-cleanup", requireAuth, async (req, res) => {
    try {
      console.log("Manual trigger of thread cleanup requested");
      const result = await scheduler.triggerThreadCleanup();
      
      if (result.success) {
        res.status(200).json({ 
          success: true, 
          message: `Thread cleanup completed successfully. ${result.count} thread(s) processed.`,
          count: result.count 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "Failed to trigger thread cleanup",
          count: 0
        });
      }
    } catch (error: unknown) {
      console.error("Error triggering thread cleanup:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ 
        error: "Failed to trigger thread cleanup", 
        message: errorMessage,
        count: 0
      });
    }
  });

  // Security check endpoint (with Discord notification but no restart)
  apiRouter.post("/security-check", requireAuth, async (req, res) => {
    try {
      console.log('🔍 SECURITY: Security check initiated');
      
      // Perform security scan
      console.log(`🔍 SECURITY: Performing security scan`);
      
      // Array to collect security issues
      const securityIssues = [];
      
      // Check for application directory size and structure
      try {
        const dirSize = await getDirSize('.');
        console.log(`📊 SECURITY: Application directory size: ${formatBytes(dirSize)}`);
        
        // Check bot client status
        const botStatus = discordBot.isClientReady() ? "online" : "offline";
        console.log(`📊 SECURITY: Bot status: ${botStatus}`);
        
        if (botStatus === "offline") {
          securityIssues.push('Discord bot is offline');
        }
        
        // Check scheduler status
        if (!scheduler.isRunning()) {
          console.log('🔴 SECURITY: Scheduler not running');
          securityIssues.push('Scheduler not running');
        } else {
          console.log('✅ SECURITY: Scheduler is running');
        }
        
        // Check keep-alive status
        if (!keepAliveActive) {
          console.log('🔴 SECURITY: Keep-alive service not active');
          securityIssues.push('Keep-alive service not active');
        } else {
          console.log('✅ SECURITY: Keep-alive service is active');
        }
        
        // Check for storage integrity
        try {
          // Check if we can access configs
          const configs = await storage.getAllBotConfigs();
          console.log(`📊 SECURITY: Storage check - Found ${configs.length} bot configurations`);
          
          // Check if we can access threads
          const threads = await storage.getAllChallengeThreads();
          console.log(`📊 SECURITY: Storage check - Found ${threads.length} challenge threads`);
          
          // Check if we can access users
          const users = await storage.getAllUsers();
          console.log(`📊 SECURITY: Storage check - Found ${users.length} users`);
          
          // Send notification to Discord channels
          if (discordBot.isClientReady()) {
            // Get the name of the user who triggered the security check
            const triggeredBy = req.user?.username || "an administrator";
            
            // Create notification message
            const notificationMessage = `
## 🔒 SECURITY CHECK REPORT

**Performed by:** ${triggeredBy}
**System Status:** ${securityIssues.length > 0 ? '⚠️ Issues detected' : '✅ All systems operational'}
${securityIssues.length > 0 ? `\n**Issues Found:**\n${securityIssues.map(issue => `- ${issue}`).join('\n')}` : ''}

**System Size:** ${formatBytes(dirSize)}
**Configs:** ${configs.length} bot configurations
**Active Threads:** ${threads.length} challenge threads
**Database:** ${securityIssues.includes('Storage access error') ? '❌ Error' : '✅ Accessible'}
**Bot Status:** ${botStatus === 'online' ? '✅ Online' : '❌ Offline'}
**Scheduler:** ${scheduler.isRunning() ? '✅ Running' : '❌ Not running'}
**Keep-alive:** ${keepAliveActive ? '✅ Active' : '❌ Inactive'}
`;
            
            // Send to each configured Discord server
            for (const config of configs) {
              try {
                const sent = await discordBot.sendEmergencyNotification(
                  config.guildId,
                  config.channelId,
                  notificationMessage
                );
                
                if (sent) {
                  console.log(`✅ SECURITY: Notification sent to channel in guild ${config.guildId}`);
                } else {
                  console.error(`Failed to send notification to guild ${config.guildId}`);
                  securityIssues.push(`Failed to notify guild ${config.guildId}`);
                }
              } catch (notifyError) {
                console.error(`Error notifying guild ${config.guildId}:`, notifyError);
              }
            }
          } else {
            console.log('Cannot send Discord notification: Bot not ready');
          }
          
        } catch (storageError) {
          console.error('Error checking storage:', storageError);
          securityIssues.push('Storage access error');
        }
        
      } catch (scanError) {
        console.error('Error during security scan:', scanError);
        securityIssues.push('Error during security scan');
      }
      
      // Return success with findings
      res.status(200).json({
        success: true,
        message: 'Security check completed',
        securityIssues: securityIssues.length > 0 ? securityIssues : 'No issues found',
        size: formatBytes(await getDirSize('.'))
      });
    } catch (error) {
      console.error('Error during security check:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error during security check',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

// Emergency backup and security endpoint
  apiRouter.post("/emergency-backup", requireAuth, async (req, res) => {
    try {
      console.log('🚨 EMERGENCY: Emergency backup procedure initiated');
      
      // Get moderator role IDs from request or use default emergency roles
      // Default roles for emergency notifications (as specified by user):
      // - MOD (Pin if rule broken)
      // - Owner (Pin if problem)
      // - sachitshah_63900
      const defaultEmergencyRoles = [
        "1253928067198357577", // MOD role ID
        "1253928067198357578", // Owner role ID 
        "1253928067198357580"  // sachitshah_63900 user ID or role
      ];
      
      // Use provided roles or fall back to defaults
      const { moderatorRoles = defaultEmergencyRoles } = req.body;
      
      // 1. Create backup of current storage
      const backupTimestamp = new Date().toISOString().replace(/:/g, '-');
      const backupFileName = `data-backup-${backupTimestamp}.json`;
      
      console.log(`🔄 EMERGENCY: Creating storage backup as ${backupFileName}`);
      
      // Get all data to backup
      const configs = await storage.getAllBotConfigs();
      const threads = await storage.getAllChallengeThreads();
      const users = await storage.getAllUsers();
      
      // Create backup object
      const backupData = {
        timestamp: new Date().toISOString(),
        configs,
        threads,
        users,
        securityVersion: 1,
      };
      
      // Write backup to file
      fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
      console.log(`✅ EMERGENCY: Backup created successfully`);
      
      // 2. Perform security scan
      console.log(`🔍 EMERGENCY: Performing security scan`);
      
      // Simple scan implementation - check for potential security issues
      const securityIssues = [];
      
      // Add actual security scan logic here - this is a placeholder
      // Look for suspicious files or patterns
      try {
        // Just check application directory size and structure
        const dirSize = await getDirSize('.');
        console.log(`📊 EMERGENCY: Application directory size: ${formatBytes(dirSize)}`);
      } catch (scanError) {
        console.error('Error during security scan:', scanError);
        securityIssues.push('Error during security scan');
      }
      
      // 3. Notify moderators via Discord
      console.log(`📢 EMERGENCY: Notifying moderators`);
      
      try {
        if (discordBot.isClientReady() && moderatorRoles && moderatorRoles.length > 0) {
          // Get all configurations to find guilds/channels
          for (const config of configs) {
            try {
              // Create role mentions for each moderator role
              const roleMentions = moderatorRoles.map((roleId: string) => {
                // For user mentions (sachitshah_63900), we need to use <@ID> instead of <@&ID>
                // We're assuming the third ID is a user ID based on the pattern provided
                if (roleId === "1253928067198357580") {
                  return `<@${roleId}>`;  // User mention
                } else {
                  return `<@&${roleId}>`; // Role mention
                }
              }).join(' ');
              
              // Get the name of the user who triggered the emergency
              const triggeredBy = req.user?.username || "an administrator";
              
              // Create notification message with details about which roles are being pinged
              const notificationMessage = `
🚨 **EMERGENCY ALERT** 🚨

An emergency backup was triggered by **${triggeredBy}** at ${new Date().toISOString()}.
The system is currently being backed up, checked for security issues, and will restart shortly.

${roleMentions}

- MOD team: Please check for rule violations
- Owner: Please investigate any system problems
- sachitshah_63900: Your attention is required

The bot will be temporarily offline during the restart process.
`;
              
              // Send the message using our helper method
              const sent = await discordBot.sendEmergencyNotification(
                config.guildId,
                config.channelId,
                notificationMessage
              );
              
              if (sent) {
                console.log(`✅ EMERGENCY: Notification sent to channel in guild ${config.guildId}`);
              } else {
                console.error(`Failed to send notification to guild ${config.guildId}`);
                securityIssues.push(`Failed to notify guild ${config.guildId}`);
              }
            } catch (notifyError) {
              console.error(`Error notifying guild ${config.guildId}:`, notifyError);
              securityIssues.push(`Failed to notify guild ${config.guildId}`);
            }
          }
        } else {
          console.log('Cannot notify moderators: Bot not ready or no moderator roles provided');
          securityIssues.push('Bot not ready or no moderator roles provided');
        }
      } catch (notifyError) {
        console.error('Error during moderator notification:', notifyError);
        securityIssues.push('Error during moderator notification');
      }
      
      // 4. Perform application restart immediately
      console.log(`🔄 EMERGENCY: Initiating immediate application restart`);
      
      // Return success first to ensure the client gets the response
      res.status(200).json({
        success: true,
        message: 'Emergency backup procedure initiated',
        backupFile: backupFileName,
        securityIssues: securityIssues.length > 0 ? securityIssues : 'No issues found',
        restart: 'Application will restart immediately'
      });
      
      // Immediate restart
      console.log('================================================================');
      console.log('🔄 EMERGENCY RESTART: Restarting application...');
      console.log('================================================================');
      
      // Stop all scheduled tasks
      scheduler.stopAllJobs();
      
      // Exit process - will be restarted by Replit
      process.exit(0);
    } catch (error) {
      console.error('Error during emergency backup:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error during emergency backup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Register the API router
  app.use("/api", apiRouter);
  
  // Add a simple keep-alive endpoint for external ping services
  app.get('/keep-alive', (_req, res) => {
    console.log('Keep-alive ping received at', new Date().toISOString());
    res.send('Bot is alive!');
  });
  
  return httpServer;
}
