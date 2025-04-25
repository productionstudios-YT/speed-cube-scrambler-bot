import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { discordBot } from "./discord/bot";
import { scheduler } from "./discord/scheduler";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import cookieParser from "cookie-parser";
import cors from "cors";
import "./keep-alive"; // Import keep-alive service

const app = express();

// Configure CORS to allow credentials
app.use(cors({
  origin: (origin, callback) => {
    // Allow any origin to facilitate local development in Replit
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add additional headers for cookies
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Middleware for logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize Discord bot and scheduler
async function initializeServices() {
  try {
    // Initialize Discord bot with token from environment variable
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.error("DISCORD_TOKEN environment variable is required");
      process.exit(1);
    }
    
    // Initialize the Discord bot
    await discordBot.initialize(token);
    
    // Create a default bot config if none exists
    const configs = await storage.getAllBotConfigs();
    if (configs.length === 0) {
      // Default config with updated values
      await storage.createBotConfig({
        channelId: "1295224323455582269", // Updated channel ID
        guildId: "1253928067198357575", // Updated guild ID
        timeToPost: "16:00", // 4:00 PM
        timezone: "Asia/Kolkata", // IST
        enabled: true,
        deleteAfterHours: 24
      });
    }
    
    // Initialize the scheduler
    await scheduler.initialize();
    
    console.log("Discord bot and scheduler initialized successfully");
  } catch (error) {
    console.error("Failed to initialize services:", error);
    process.exit(1);
  }
}

(async () => {
  // Set up authentication
  await setupAuth(app);
  
  // Register all routes
  const server = await registerRoutes(app);
  
  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Setup Vite in development or serve static files in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Run on port 5000
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Server listening on port ${port}`);
    
    // Initialize Discord bot and scheduler after server starts
    initializeServices().catch(err => {
      console.error("Failed to initialize services:", err);
    });
  });
  
  // Handle graceful shutdown with enhanced error handling and process monitoring
  const shutdown = async (signal: string) => {
    log(`Shutting down server due to ${signal} signal...`);
    
    try {
      // Notify server is shutting down
      console.log('================================================================');
      console.log(`🛑 SHUTDOWN SEQUENCE INITIATED - Signal: ${signal}`);
      console.log('================================================================');
      
      // Stop all scheduled jobs with timeout
      console.log('1️⃣ Stopping all scheduled jobs...');
      const schedulerPromise = Promise.race([
        scheduler.stopAllJobs(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Scheduler shutdown timeout')), 5000))
      ]).catch(err => console.warn('Warning: Scheduler shutdown incomplete:', err));
      
      await schedulerPromise;
      console.log('✅ Scheduler shutdown complete');
      
      // Shutdown the Discord bot with timeout
      console.log('2️⃣ Shutting down Discord bot...');
      const botPromise = Promise.race([
        discordBot.shutdown(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Discord bot shutdown timeout')), 10000))
      ]).catch(err => console.warn('Warning: Discord bot shutdown incomplete:', err));
      
      await botPromise;
      console.log('✅ Discord bot shutdown complete');
      
      // Wait for any pending operations
      console.log('3️⃣ Waiting for any pending operations to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('================================================================');
      console.log('✅ SHUTDOWN COMPLETE - System is ready to terminate');
      console.log('================================================================');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    } finally {
      // Force exit after 15 seconds if clean shutdown fails
      const forceExitTimeout = setTimeout(() => {
        console.error('⛔ Force exiting after timeout - Some resources may not have been cleaned up properly');
        process.exit(1);
      }, 15000);
      
      // Clear the timeout if we exit normally
      forceExitTimeout.unref();
      
      // Exit with success code
      process.exit(0);
    }
  };
  
  // Register signal handlers for different termination scenarios
  process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
  process.on('SIGTERM', () => shutdown('SIGTERM')); // Kill command
  process.on('SIGHUP', () => shutdown('SIGHUP'));   // Terminal closed
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('⚠️ UNCAUGHT EXCEPTION:', error);
    // Don't exit for uncaught exceptions - let the bot try to recover
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    // Don't exit for unhandled rejections - let the bot try to recover
  });
})();
