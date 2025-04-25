import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { User, userRoles } from "@shared/schema";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Constants
const DEVELOPER_PASSWORD = "Dev@SpeedCube2025#";
const OWNER_PASSWORD = "Owner@SpeedCube2025!";
const JWT_SECRET = process.env.JWT_SECRET || "speedcube-scrambler-jwt-secret";
const JWT_EXPIRES_IN = "7d"; // 7 days

// Define express user interface
declare global {
  namespace Express {
    // Define the User interface for Express.User
    interface User {
      id: number;
      username: string;
      passwordHash: string;
      role: string;
      createdAt: Date;
      lastLogin: Date | null;
    }
  }
}

// Function to hash a password
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hashSync(password, 10);
}

// Function to verify a password against a stored hash
async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  return bcrypt.compareSync(supplied, stored);
}

// Generate a JWT token for a user
function generateToken(user: User): string {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Extract and verify the JWT token from auth header
function extractAndVerifyToken(req: Request): { id: number; username: string; role: string } | null {
  try {
    const authHeader = req.headers.authorization || '';
    
    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return null;
    }
    
    // Verify and decode the token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; role: string };
    return decoded;
  } catch (err) {
    console.log('Token verification error:', err);
    return null;
  }
}

// Function to set up authentication 
export async function setupAuth(app: Express) {
  // Setup CORS headers for auth routes
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // Debug headers for auth routes
    if (req.path === '/api/login' || req.path === '/api/auth/user') {
      console.log('Request to auth route from origin:', req.headers.origin);
      console.log('Auth headers:', req.headers.authorization);
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });
  
  // Create initial users if they don't exist
  await createInitialUsers();

  // Login endpoint - exchange credentials for JWT token
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      console.log('Login attempt for user:', username);
      
      // Find user by username
      const user = await storage.getUserByUsername(username);
      
      if (!user || !(await comparePasswords(password, user.passwordHash))) {
        console.log('Login failed - invalid credentials');
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      // Update last login timestamp
      await storage.updateUserLastLogin(user.id);
      
      // Generate JWT token
      const token = generateToken(user);
      
      console.log('Login successful for:', user.username);
      
      // Send token and user info
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (err) {
      console.log('Login error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current user from token
  app.get("/api/auth/user", (req, res) => {
    try {
      const userData = extractAndVerifyToken(req);
      
      if (!userData) {
        console.log('Auth check failed - invalid or missing token');
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      console.log('User authenticated from token:', userData.username);
      
      res.json({
        id: userData.id,
        username: userData.username,
        role: userData.role
      });
    } catch (err) {
      console.log('Auth check error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Debug endpoint
  app.get("/api/debug/auth", (req, res) => {
    const authHeader = req.headers.authorization || '';
    
    res.json({
      hasAuthHeader: !!authHeader,
      authHeader: authHeader ? `${authHeader.substring(0, 10)}...` : '',
      isValid: !!extractAndVerifyToken(req)
    });
  });
}

// Middleware to check if user is authenticated via JWT
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userData = extractAndVerifyToken(req);
    
    if (!userData) {
      console.log('Auth check failed - invalid or missing token');
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Add user data to request object for use in protected routes
    (req as any).user = userData;
    
    console.log('Auth check passed - user authenticated:', userData.username);
    next();
  } catch (err) {
    console.log('Auth check error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Create initial developer and owner accounts
async function createInitialUsers() {
  // Check if users exist
  const users = await storage.getAllUsers();
  
  // If no users exist, create the initial accounts
  if (users.length === 0) {
    // Create developer account
    const devPasswordHash = await hashPassword(DEVELOPER_PASSWORD);
    await storage.createUser("developer", devPasswordHash, userRoles.DEVELOPER);
    
    // Create owner account
    const ownerPasswordHash = await hashPassword(OWNER_PASSWORD);
    await storage.createUser("owner", ownerPasswordHash, userRoles.OWNER);
    
    console.log("Initial accounts created.");
  }
}