import { 
  BotConfig, ChallengeThread, InsertBotConfig, InsertChallengeThread, 
  User, UserRole, CommandUsage, SystemMetrics, DailyAnalytics, ScramblePerformance,
  InsertCommandUsage, InsertSystemMetrics, InsertDailyAnalytics, InsertScramblePerformance
} from '@shared/schema';
import { db } from './db';
import { 
  botConfig, challengeThreads, users, commandUsage, 
  systemMetrics, dailyAnalytics, scramblePerformance 
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from './db';

// Interface for the storage operations
export interface IStorage {
  sessionStore: session.Store;
  // Bot config operations
  getBotConfig(id: number): Promise<BotConfig | undefined>;
  getBotConfigByGuildId(guildId: string): Promise<BotConfig | undefined>;
  getAllBotConfigs(): Promise<BotConfig[]>;
  createBotConfig(config: InsertBotConfig): Promise<BotConfig>;
  updateBotConfig(id: number, config: Partial<BotConfig>): Promise<BotConfig | undefined>;
  deleteBotConfig(id: number): Promise<boolean>;
  
  // Challenge thread operations
  getChallengeThread(id: number): Promise<ChallengeThread | undefined>;
  getChallengeThreadByThreadId(threadId: string): Promise<ChallengeThread | undefined>;
  getAllChallengeThreads(): Promise<ChallengeThread[]>;
  getExpiredThreads(): Promise<ChallengeThread[]>;
  createChallengeThread(thread: InsertChallengeThread): Promise<ChallengeThread>;
  markThreadAsDeleted(id: number): Promise<boolean>;
  
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(username: string, passwordHash: string, role: UserRole): Promise<User>;
  updateUserLastLogin(id: number): Promise<User | undefined>;
  
  // Analytics operations
  // Command usage tracking
  logCommandUsage(data: InsertCommandUsage): Promise<CommandUsage>;
  getCommandUsage(limit?: number): Promise<CommandUsage[]>;
  getCommandUsageByName(commandName: string, limit?: number): Promise<CommandUsage[]>;
  getCommandUsageByUser(userId: string, limit?: number): Promise<CommandUsage[]>;
  
  // System metrics tracking
  recordSystemMetrics(metrics: InsertSystemMetrics): Promise<SystemMetrics>;
  getLatestSystemMetrics(): Promise<SystemMetrics | undefined>;
  getSystemMetricsHistory(limit?: number): Promise<SystemMetrics[]>;
  
  // Daily analytics tracking
  createOrUpdateDailyAnalytics(date: Date, data: Partial<InsertDailyAnalytics>): Promise<DailyAnalytics>;
  getDailyAnalytics(date: Date): Promise<DailyAnalytics | undefined>;
  getDailyAnalyticsRange(startDate: Date, endDate: Date): Promise<DailyAnalytics[]>;
  
  // Scramble performance tracking
  recordScramblePerformance(data: InsertScramblePerformance): Promise<ScramblePerformance>;
  getScramblePerformance(limit?: number): Promise<ScramblePerformance[]>;
  getScramblePerformanceByUser(userId: string, limit?: number): Promise<ScramblePerformance[]>;
  getScramblePerformanceByCubeType(cubeType: string, limit?: number): Promise<ScramblePerformance[]>;
  getAverageScramblePerformanceByCubeType(): Promise<{cubeType: string, averageSolveTime: number}[]>;
}

export class MemStorage implements IStorage {
  private botConfigs: Map<number, BotConfig>;
  private challengeThreads: Map<number, ChallengeThread>;
  private users: Map<number, User>;
  private botConfigCurrentId: number;
  private challengeThreadCurrentId: number;
  private userCurrentId: number;
  sessionStore: session.Store;
  
  constructor() {
    this.botConfigs = new Map();
    this.challengeThreads = new Map();
    this.users = new Map();
    this.botConfigCurrentId = 1;
    this.challengeThreadCurrentId = 1;
    this.userCurrentId = 1;
    
    // Create in-memory session store
    const createMemoryStore = require('memorystore');
    const MemoryStore = createMemoryStore(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    
    // Load data from file if exists
    this.loadFromFile();
  }
  
  /**
   * Save current state to file for persistence between restarts
   */
  private saveToFile(): void {
    const data = {
      botConfigs: Array.from(this.botConfigs.entries()),
      challengeThreads: Array.from(this.challengeThreads.entries()),
      users: Array.from(this.users.entries()),
      botConfigCurrentId: this.botConfigCurrentId,
      challengeThreadCurrentId: this.challengeThreadCurrentId,
      userCurrentId: this.userCurrentId
    };
    
    try {
      // Using Node.js native fs module in ESM context
      import('node:fs').then(fs => {
        fs.writeFileSync('./data-storage.json', JSON.stringify(data, null, 2));
        console.log('Storage state saved to file');
      }).catch(err => {
        console.error('Error importing fs module:', err);
      });
    } catch (error) {
      console.error('Error saving storage state to file:', error);
    }
  }
  
  /**
   * Load state from file
   */
  private loadFromFile(): void {
    try {
      // Using dynamic import for fs in ESM context
      import('node:fs').then(fs => {
        if (fs.existsSync('./data-storage.json')) {
          const data = JSON.parse(fs.readFileSync('./data-storage.json', 'utf8'));
          
          // Restore bot configs
          data.botConfigs.forEach(([id, config]: [number, BotConfig]) => {
            this.botConfigs.set(id, {
              ...config
            });
          });
          
          // Restore challenge threads
          data.challengeThreads.forEach(([id, thread]: [number, ChallengeThread]) => {
            this.challengeThreads.set(id, {
              ...thread,
              createdAt: new Date(thread.createdAt),
              expiresAt: new Date(thread.expiresAt)
            });
          });
          
          // Restore users
          data.users.forEach(([id, user]: [number, User]) => {
            this.users.set(id, {
              ...user,
              createdAt: new Date(user.createdAt),
              lastLogin: user.lastLogin ? new Date(user.lastLogin) : null
            });
          });
          
          // Restore IDs
          this.botConfigCurrentId = data.botConfigCurrentId;
          this.challengeThreadCurrentId = data.challengeThreadCurrentId;
          this.userCurrentId = data.userCurrentId;
          
          console.log('Storage state loaded from file');
        }
      }).catch(err => {
        console.error('Error importing fs module:', err);
      });
    } catch (error) {
      console.error('Error loading storage state from file:', error);
    }
  }
  
  // Bot config methods
  async getBotConfig(id: number): Promise<BotConfig | undefined> {
    return this.botConfigs.get(id);
  }
  
  async getBotConfigByGuildId(guildId: string): Promise<BotConfig | undefined> {
    return Array.from(this.botConfigs.values()).find(
      (config) => config.guildId === guildId
    );
  }
  
  async getAllBotConfigs(): Promise<BotConfig[]> {
    return Array.from(this.botConfigs.values());
  }
  
  async createBotConfig(config: InsertBotConfig): Promise<BotConfig> {
    const id = this.botConfigCurrentId++;
    // Ensure all required properties have values
    const newConfig: BotConfig = { 
      id,
      channelId: config.channelId,
      guildId: config.guildId,
      timeToPost: config.timeToPost || "16:00", // Default: 4:00 PM
      timezone: config.timezone || "Asia/Kolkata", // Default: IST
      enabled: config.enabled !== undefined ? config.enabled : true, // Default: true
      deleteAfterHours: config.deleteAfterHours || 24 // Default: 24 hours
    };
    this.botConfigs.set(id, newConfig);
    this.saveToFile();
    return newConfig;
  }
  
  async updateBotConfig(id: number, config: Partial<BotConfig>): Promise<BotConfig | undefined> {
    const existingConfig = this.botConfigs.get(id);
    if (!existingConfig) return undefined;
    
    const updatedConfig = { ...existingConfig, ...config };
    this.botConfigs.set(id, updatedConfig);
    this.saveToFile();
    return updatedConfig;
  }
  
  async deleteBotConfig(id: number): Promise<boolean> {
    const result = this.botConfigs.delete(id);
    this.saveToFile();
    return result;
  }
  
  // Challenge thread methods
  async getChallengeThread(id: number): Promise<ChallengeThread | undefined> {
    return this.challengeThreads.get(id);
  }
  
  async getChallengeThreadByThreadId(threadId: string): Promise<ChallengeThread | undefined> {
    return Array.from(this.challengeThreads.values()).find(
      (thread) => thread.threadId === threadId
    );
  }
  
  async getAllChallengeThreads(): Promise<ChallengeThread[]> {
    return Array.from(this.challengeThreads.values());
  }
  
  async getExpiredThreads(): Promise<ChallengeThread[]> {
    const now = new Date();
    return Array.from(this.challengeThreads.values()).filter(
      (thread) => !thread.isDeleted && thread.expiresAt < now
    );
  }
  
  async createChallengeThread(thread: InsertChallengeThread): Promise<ChallengeThread> {
    const id = this.challengeThreadCurrentId++;
    const newThread: ChallengeThread = { 
      ...thread, 
      id, 
      createdAt: new Date(),
      isDeleted: false 
    };
    this.challengeThreads.set(id, newThread);
    this.saveToFile();
    return newThread;
  }
  
  async markThreadAsDeleted(id: number): Promise<boolean> {
    const thread = this.challengeThreads.get(id);
    if (!thread) return false;
    
    thread.isDeleted = true;
    this.challengeThreads.set(id, thread);
    this.saveToFile();
    return true;
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async createUser(username: string, passwordHash: string, role: UserRole): Promise<User> {
    const id = this.userCurrentId++;
    const newUser: User = {
      id,
      username,
      passwordHash,
      role,
      createdAt: new Date(),
      lastLogin: null,
    };
    this.users.set(id, newUser);
    this.saveToFile();
    return newUser;
  }
  
  async updateUserLastLogin(id: number): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    user.lastLogin = new Date();
    this.users.set(id, user);
    this.saveToFile();
    return user;
  }

  // Analytics operations implementation (in-memory)
  // Command usage tracking
  async logCommandUsage(data: InsertCommandUsage): Promise<CommandUsage> {
    // In-memory implementation (simplified for memory storage)
    const entry: CommandUsage = {
      id: 1, // In memory, we don't track these properly
      channelId: data.channelId || null,
      guildId: data.guildId || null,
      error: data.error || null,
      status: data.status,
      timestamp: new Date(),
      commandName: data.commandName,
      userId: data.userId,
      parameters: data.parameters || null,
      executionTime: data.executionTime || null
    };
    return entry;
  }
  
  async getCommandUsage(limit: number = 100): Promise<CommandUsage[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  async getCommandUsageByName(commandName: string, limit: number = 100): Promise<CommandUsage[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  async getCommandUsageByUser(userId: string, limit: number = 100): Promise<CommandUsage[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  // System metrics tracking
  async recordSystemMetrics(metrics: InsertSystemMetrics): Promise<SystemMetrics> {
    // Simplified for in-memory storage
    const entry: SystemMetrics = {
      id: 1,
      timestamp: new Date(),
      rssMemory: metrics.rssMemory,
      heapTotal: metrics.heapTotal,
      heapUsed: metrics.heapUsed,
      external: metrics.external,
      uptime: metrics.uptime,
      activeThreads: metrics.activeThreads,
      cpuUsage: metrics.cpuUsage || null,
      loadAverage: metrics.loadAverage || null
    };
    return entry;
  }
  
  async getLatestSystemMetrics(): Promise<SystemMetrics | undefined> {
    // Simplified for in-memory storage
    return undefined;
  }
  
  async getSystemMetricsHistory(limit: number = 100): Promise<SystemMetrics[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  // Daily analytics tracking
  async createOrUpdateDailyAnalytics(date: Date, data: Partial<InsertDailyAnalytics>): Promise<DailyAnalytics> {
    // Simplified for in-memory storage
    const entry: DailyAnalytics = {
      id: 1,
      date: date.toISOString().split('T')[0], // Convert Date to YYYY-MM-DD string format
      totalCommands: data.totalCommands ?? 0,
      commandBreakdown: data.commandBreakdown,
      scrambleUsage: data.scrambleUsage,
      dailyActiveUsers: data.dailyActiveUsers ?? 0,
      averageResponseTime: data.averageResponseTime ?? null,
      errorCount: data.errorCount ?? 0,
      dailyChallengeMetrics: data.dailyChallengeMetrics
    };
    return entry;
  }
  
  async getDailyAnalytics(date: Date): Promise<DailyAnalytics | undefined> {
    // Simplified for in-memory storage
    return undefined;
  }
  
  async getDailyAnalyticsRange(startDate: Date, endDate: Date): Promise<DailyAnalytics[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  // Scramble performance tracking
  async recordScramblePerformance(data: InsertScramblePerformance): Promise<ScramblePerformance> {
    // Simplified for in-memory storage
    const entry: ScramblePerformance = {
      id: 1,
      timestamp: new Date(),
      scramble: data.scramble,
      cubeType: data.cubeType,
      userId: data.userId,
      guildId: data.guildId || null,
      solveTime: data.solveTime || null,
      isCustomScramble: data.isCustomScramble || false,
      customParameters: data.customParameters || null
    };
    return entry;
  }
  
  async getScramblePerformance(limit: number = 100): Promise<ScramblePerformance[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  async getScramblePerformanceByUser(userId: string, limit: number = 100): Promise<ScramblePerformance[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  async getScramblePerformanceByCubeType(cubeType: string, limit: number = 100): Promise<ScramblePerformance[]> {
    // Simplified for in-memory storage
    return [];
  }
  
  async getAverageScramblePerformanceByCubeType(): Promise<{cubeType: string, averageSolveTime: number}[]> {
    // Simplified for in-memory storage
    return [];
  }
}

// Database Storage implementation
export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    const PostgresSessionStore = connectPg(session);
    this.sessionStore = new PostgresSessionStore({ 
      pool,
      createTableIfMissing: true 
    });
  }

  // Bot config methods
  async getBotConfig(id: number): Promise<BotConfig | undefined> {
    const [config] = await db.select().from(botConfig).where(eq(botConfig.id, id));
    return config;
  }
  
  async getBotConfigByGuildId(guildId: string): Promise<BotConfig | undefined> {
    const [config] = await db.select().from(botConfig).where(eq(botConfig.guildId, guildId));
    return config;
  }
  
  async getAllBotConfigs(): Promise<BotConfig[]> {
    return await db.select().from(botConfig);
  }
  
  async createBotConfig(config: InsertBotConfig): Promise<BotConfig> {
    const [newConfig] = await db.insert(botConfig).values(config).returning();
    return newConfig;
  }
  
  async updateBotConfig(id: number, config: Partial<BotConfig>): Promise<BotConfig | undefined> {
    const [updated] = await db.update(botConfig)
      .set(config)
      .where(eq(botConfig.id, id))
      .returning();
    return updated;
  }
  
  async deleteBotConfig(id: number): Promise<boolean> {
    try {
      const result = await db.delete(botConfig).where(eq(botConfig.id, id));
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error) {
      console.error("Error deleting bot config:", error);
      return false;
    }
  }
  
  // Challenge thread methods
  async getChallengeThread(id: number): Promise<ChallengeThread | undefined> {
    const [thread] = await db.select().from(challengeThreads).where(eq(challengeThreads.id, id));
    return thread;
  }
  
  async getChallengeThreadByThreadId(threadId: string): Promise<ChallengeThread | undefined> {
    const [thread] = await db.select().from(challengeThreads).where(eq(challengeThreads.threadId, threadId));
    return thread;
  }
  
  async getAllChallengeThreads(): Promise<ChallengeThread[]> {
    return await db.select().from(challengeThreads).orderBy(desc(challengeThreads.createdAt));
  }
  
  async getExpiredThreads(): Promise<ChallengeThread[]> {
    const now = new Date();
    return await db.select()
      .from(challengeThreads)
      .where(
        and(
          eq(challengeThreads.isDeleted, false),
          sql`${challengeThreads.expiresAt} < ${now}`
        )
      );
  }
  
  async createChallengeThread(thread: InsertChallengeThread): Promise<ChallengeThread> {
    const [newThread] = await db.insert(challengeThreads).values({
      ...thread,
      createdAt: new Date(),
      isDeleted: false
    }).returning();
    return newThread;
  }
  
  async markThreadAsDeleted(id: number): Promise<boolean> {
    try {
      const result = await db.update(challengeThreads)
        .set({ isDeleted: true })
        .where(eq(challengeThreads.id, id));
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error) {
      console.error("Error marking thread as deleted:", error);
      return false;
    }
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  async createUser(username: string, passwordHash: string, role: UserRole): Promise<User> {
    const [user] = await db.insert(users).values({
      username,
      passwordHash,
      role,
      createdAt: new Date(),
      lastLogin: null
    }).returning();
    return user;
  }
  
  async updateUserLastLogin(id: number): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Analytics operations implementation
  // Command usage tracking
  async logCommandUsage(data: InsertCommandUsage): Promise<CommandUsage> {
    const [entry] = await db.insert(commandUsage).values(data).returning();
    return entry;
  }
  
  async getCommandUsage(limit: number = 100): Promise<CommandUsage[]> {
    return await db.select()
      .from(commandUsage)
      .orderBy(desc(commandUsage.timestamp))
      .limit(limit);
  }
  
  async getCommandUsageByName(commandName: string, limit: number = 100): Promise<CommandUsage[]> {
    return await db.select()
      .from(commandUsage)
      .where(eq(commandUsage.commandName, commandName))
      .orderBy(desc(commandUsage.timestamp))
      .limit(limit);
  }
  
  async getCommandUsageByUser(userId: string, limit: number = 100): Promise<CommandUsage[]> {
    return await db.select()
      .from(commandUsage)
      .where(eq(commandUsage.userId, userId))
      .orderBy(desc(commandUsage.timestamp))
      .limit(limit);
  }
  
  // System metrics tracking
  async recordSystemMetrics(metrics: InsertSystemMetrics): Promise<SystemMetrics> {
    const [entry] = await db.insert(systemMetrics).values(metrics).returning();
    return entry;
  }
  
  async getLatestSystemMetrics(): Promise<SystemMetrics | undefined> {
    const [entry] = await db.select()
      .from(systemMetrics)
      .orderBy(desc(systemMetrics.timestamp))
      .limit(1);
    return entry;
  }
  
  async getSystemMetricsHistory(limit: number = 100): Promise<SystemMetrics[]> {
    return await db.select()
      .from(systemMetrics)
      .orderBy(desc(systemMetrics.timestamp))
      .limit(limit);
  }
  
  // Daily analytics tracking
  async createOrUpdateDailyAnalytics(date: Date, data: Partial<InsertDailyAnalytics>): Promise<DailyAnalytics> {
    // Format date to YYYY-MM-DD format for SQL date comparison
    const formattedDate = date.toISOString().split('T')[0];
    
    // Create the complete record with the formatted date
    const recordToInsert = {
      totalCommands: data.totalCommands ?? 0,
      commandBreakdown: data.commandBreakdown,
      scrambleUsage: data.scrambleUsage,
      dailyActiveUsers: data.dailyActiveUsers ?? 0,
      averageResponseTime: data.averageResponseTime ?? null,
      errorCount: data.errorCount ?? 0,
      dailyChallengeMetrics: data.dailyChallengeMetrics,
      date: formattedDate
    };
    
    // Check if an entry already exists for this date
    const [existingEntry] = await db.select()
      .from(dailyAnalytics)
      .where(sql`${dailyAnalytics.date}::text = ${formattedDate}`);
    
    if (existingEntry) {
      // Update existing entry
      const [updated] = await db.update(dailyAnalytics)
        .set(recordToInsert)
        .where(eq(dailyAnalytics.id, existingEntry.id))
        .returning();
      return updated;
    } else {
      // Create new entry
      const [newEntry] = await db.insert(dailyAnalytics)
        .values(recordToInsert)
        .returning();
      return newEntry;
    }
  }
  
  async getDailyAnalytics(date: Date): Promise<DailyAnalytics | undefined> {
    // Format date to YYYY-MM-DD format for SQL date comparison
    const formattedDate = date.toISOString().split('T')[0];
    
    const [entry] = await db.select()
      .from(dailyAnalytics)
      .where(sql`${dailyAnalytics.date}::text = ${formattedDate}`);
    return entry;
  }
  
  async getDailyAnalyticsRange(startDate: Date, endDate: Date): Promise<DailyAnalytics[]> {
    return await db.select()
      .from(dailyAnalytics)
      .where(
        and(
          sql`${dailyAnalytics.date} >= ${startDate.toISOString().split('T')[0]}`,
          sql`${dailyAnalytics.date} <= ${endDate.toISOString().split('T')[0]}`
        )
      )
      .orderBy(dailyAnalytics.date);
  }
  
  // Scramble performance tracking
  async recordScramblePerformance(data: InsertScramblePerformance): Promise<ScramblePerformance> {
    const [entry] = await db.insert(scramblePerformance).values(data).returning();
    return entry;
  }
  
  async getScramblePerformance(limit: number = 100): Promise<ScramblePerformance[]> {
    return await db.select()
      .from(scramblePerformance)
      .orderBy(desc(scramblePerformance.timestamp))
      .limit(limit);
  }
  
  async getScramblePerformanceByUser(userId: string, limit: number = 100): Promise<ScramblePerformance[]> {
    return await db.select()
      .from(scramblePerformance)
      .where(eq(scramblePerformance.userId, userId))
      .orderBy(desc(scramblePerformance.timestamp))
      .limit(limit);
  }
  
  async getScramblePerformanceByCubeType(cubeType: string, limit: number = 100): Promise<ScramblePerformance[]> {
    return await db.select()
      .from(scramblePerformance)
      .where(eq(scramblePerformance.cubeType, cubeType))
      .orderBy(desc(scramblePerformance.timestamp))
      .limit(limit);
  }
  
  async getAverageScramblePerformanceByCubeType(): Promise<{cubeType: string, averageSolveTime: number}[]> {
    const result = await db.select({
      cubeType: scramblePerformance.cubeType,
      averageSolveTime: sql<number>`avg(${scramblePerformance.solveTime})`
    })
    .from(scramblePerformance)
    .where(sql`${scramblePerformance.solveTime} IS NOT NULL`)
    .groupBy(scramblePerformance.cubeType);
    
    return result;
  }
}

// Initialize the appropriate storage implementation
let storage: IStorage;

// Check if a database URL is available and use DatabaseStorage
if (process.env.DATABASE_URL) {
  console.log('Using PostgreSQL database storage for increased capacity (300MB+)');
  storage = new DatabaseStorage();
} else {
  console.log('Using in-memory storage with file persistence');
  storage = new MemStorage();
}

export { storage };
