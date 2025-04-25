import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CubeType, cubeTypes, ChallengeThread, BotConfig } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateScramble } from "@shared/scrambleGenerators";

// Types for API responses
interface HealthResponse {
  status: string;
  botStatus: string;
  timestamp: string;
}

interface NextChallengeResponse {
  day: string;
  cubeType: string;
  nextTime: string;
  timeUntil: string;
  isToday: boolean;
}

// Discord Message Emulator Component
function DiscordMessageEmulator() {
  const [selectedCubeType, setSelectedCubeType] = useState<CubeType>(cubeTypes.THREE);
  const [scramble, setScramble] = useState<string>("");
  
  useEffect(() => {
    // Generate initial scramble
    const newScramble = generateScramble(selectedCubeType);
    setScramble(newScramble);
  }, [selectedCubeType]);
  
  const handleGenerateNewScramble = () => {
    const newScramble = generateScramble(selectedCubeType);
    setScramble(newScramble);
  };
  
  // Format date to get day of week and date for thread title
  const formatThreadDate = () => {
    const date = new Date();
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };
  
  // Get emoji representation for cube type
  const getCubeEmoji = (cubeType: string): string => {
    switch(cubeType) {
      case cubeTypes.THREE: return "🟦"; // Standard 3x3 cube
      case cubeTypes.TWO: return "🟨"; // 2x2 cube
      case cubeTypes.THREE_BLD: return "🧠"; // Blindfolded
      case cubeTypes.THREE_OH: return "🤚"; // One-handed
      case cubeTypes.SKEWB: return "🔷"; // Skewb
      case cubeTypes.PYRAMINX: return "🔺"; // Pyraminx
      case cubeTypes.CLOCK: return "🕙"; // Clock
      default: return "🟦";
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <label className="block text-[#DCDDDE] text-sm">Cube Type</label>
          <Select
            value={selectedCubeType}
            onValueChange={(value: CubeType) => setSelectedCubeType(value)}
          >
            <SelectTrigger className="bg-[#202225] border-[#202225] text-white min-w-[180px]">
              <SelectValue placeholder="Select cube type" />
            </SelectTrigger>
            <SelectContent className="bg-[#36393F] border-[#202225] text-white">
              {Object.values(cubeTypes).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button
          className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
          onClick={handleGenerateNewScramble}
        >
          <i className="fas fa-sync-alt mr-2"></i>
          Generate New Scramble
        </Button>
      </div>
      
      {/* Discord Message Preview */}
      <div className="bg-[#36393F] rounded-lg p-4 border border-[#202225]">
        <div className="flex items-center mb-2">
          <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white mr-3">
            <i className="fas fa-robot text-lg"></i>
          </div>
          <div>
            <div className="text-white font-semibold">SpeedCube Scrambler</div>
            <div className="text-xs text-[#A3A6AA]">Today at {new Date().toLocaleTimeString()}</div>
          </div>
        </div>
        
        {/* Thread Title */}
        <div className="mb-3 bg-[#2F3136] p-2 rounded-md">
          <div className="flex items-center">
            <span className="text-[#A3A6AA] mr-2">#</span>
            <span className="text-white font-medium">{selectedCubeType}</span>
          </div>
        </div>
        
        {/* Thread Content */}
        <div className="text-[#DCDDDE]">
          <div className="mb-2 text-xs text-[#A3A6AA]">
            <div className="inline-flex items-center">
              <span className="bg-[#4F545C] px-1 py-0.5 rounded text-[#DCDDDE]">@daily scramble ping</span>
            </div>
          </div>
          
          <div className="mb-3">
            <p>🗓 <strong>Today's Daily Scramble!</strong> {getCubeEmoji(selectedCubeType)}</p>
            <p>Event: <strong>{selectedCubeType}</strong></p>
          </div>
          
          <div className="mb-3 bg-[#2F3136] p-2 rounded font-mono">
            {scramble}
          </div>
          
          <p>Good luck! 🍀</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedTab, setSelectedTab] = useState<"bot" | "schedule" | "threads" | "settings" | "analytics">(
    "bot"
  );
  const [channelId, setChannelId] = useState("");
  const [guildId, setGuildId] = useState("");
  const [isCreatingTestThread, setIsCreatingTestThread] = useState(false);
  const [isTriggeringDailyPost, setIsTriggeringDailyPost] = useState(false);
  const [isCleaningThreads, setIsCleaningThreads] = useState(false);
  const [isEmergencyBackup, setIsEmergencyBackup] = useState(false);
  const [isSecurityCheck, setIsSecurityCheck] = useState(false);
  const [moderatorRoles, setModeratorRoles] = useState<string[]>([]);
  
  // Predefined roles for emergency notifications
  const predefinedRoles = {
    "MOD": "Moderator role",
    "OWNER": "Owner role",
    "SACHIT": "sachitshah_63900's user role"
  };
  const { toast } = useToast();

  const { data: healthData, isLoading: healthLoading } = useQuery<HealthResponse>({
    queryKey: ["/api/health"],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: threadsData, isLoading: threadsLoading } = useQuery<ChallengeThread[]>({
    queryKey: ["/api/threads"],
  });

  const { data: nextChallengeData, isLoading: nextChallengeLoading } = useQuery<NextChallengeResponse>({
    queryKey: ["/api/next-challenge"],
  });
  
  const { data: configData } = useQuery<BotConfig[]>({
    queryKey: ["/api/config"],
  });
  
  // Update form values when config data is loaded
  useEffect(() => {
    if (configData && Array.isArray(configData) && configData.length > 0) {
      const config = configData[0];
      setGuildId(config.guildId || "");
      setChannelId(config.channelId || "");
    }
  }, [configData]);

  const configMutation = useMutation({
    mutationFn: async (data: { guildId: string; channelId: string }) => {
      return apiRequest("POST", "/api/config", {
        guildId: data.guildId,
        channelId: data.channelId,
        enabled: true,
        timeToPost: "16:00",
        timezone: "Asia/Kolkata",
        deleteAfterHours: 24,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({
        title: "Settings Saved",
        description: "Bot configuration has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Mutation for creating a test thread
  const testThreadMutation = useMutation({
    mutationFn: async (cubeType?: string) => {
      return apiRequest("POST", "/api/create-test-thread", { cubeType });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({
        title: "Test Thread Created",
        description: `Thread created successfully in channel #🗓•daily-scramble`,
      });
      setIsCreatingTestThread(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create test thread: ${error.message}`,
        variant: "destructive",
      });
      setIsCreatingTestThread(false);
    }
  });
  
  // Mutation for triggering daily post
  const triggerDailyPostMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/trigger-daily-post", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({
        title: "Daily Post Triggered",
        description: `Daily post has been triggered successfully for today's cube type`,
      });
      setIsTriggeringDailyPost(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to trigger daily post: ${error.message}`,
        variant: "destructive",
      });
      setIsTriggeringDailyPost(false);
    }
  });
  
  // Mutation for cleaning up threads
  const cleanupThreadsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/trigger-thread-cleanup", {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      toast({
        title: "Threads Cleaned Up",
        description: `Successfully cleaned up ${data.count || 0} expired thread(s)`,
      });
      setIsCleaningThreads(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to clean up threads: ${error.message}`,
        variant: "destructive",
      });
      setIsCleaningThreads(false);
    }
  });
  
  // Mutation for security check (silent, no notifications)
  const securityCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/security-check", {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Security Check Complete",
        description: data.securityIssues === 'No issues found' 
          ? 'No security issues found. System secure.' 
          : `Found security issues: ${data.securityIssues}`,
      });
      setIsSecurityCheck(false);
    },
    onError: (error) => {
      toast({
        title: "Security Check Failed",
        description: `Failed to perform security check: ${error.message}`,
        variant: "destructive",
      });
      setIsSecurityCheck(false);
    }
  });
  
  // Mutation for emergency backup procedure
  const emergencyBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/emergency-backup", {
        moderatorRoles: moderatorRoles
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Emergency Backup Initiated",
        description: `Successfully created backup: ${data.backupFile}. Application will restart immediately.`,
      });
      setIsEmergencyBackup(false);
      
      // Show a system-level notification as well for critical action
      toast({
        title: "SYSTEM IS RESTARTING",
        description: "The system will be unavailable for a few seconds while restarting...",
        variant: "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "Emergency Backup Failed",
        description: `Failed to perform emergency backup: ${error.message}`,
        variant: "destructive",
      });
      setIsEmergencyBackup(false);
    }
  });
  
  // Function to create a test thread
  const createTestThread = () => {
    if (isCreatingTestThread) return;
    
    setIsCreatingTestThread(true);
    testThreadMutation.mutate("3x3"); // Default to 3x3 scramble
  };
  
  // Function to trigger daily post
  const triggerDailyPost = () => {
    if (isTriggeringDailyPost) return;
    
    setIsTriggeringDailyPost(true);
    triggerDailyPostMutation.mutate();
  };
  
  // Function to clean up threads
  const cleanupThreads = () => {
    if (isCleaningThreads) return;
    
    setIsCleaningThreads(true);
    cleanupThreadsMutation.mutate();
  };
  
  // Function to perform security check
  const performSecurityCheck = () => {
    if (isSecurityCheck) return;
    
    setIsSecurityCheck(true);
    securityCheckMutation.mutate();
  };
  
  // Function to trigger emergency backup
  const triggerEmergencyBackup = () => {
    if (isEmergencyBackup) return;
    
    // Create checkbox options for roles
    const roleSelectionMessage = `⚠️ WARNING: This will perform an emergency backup, ping moderators, and restart the system.

This should ONLY be used in emergency situations.

Which roles should be pinged during this emergency?
- MOD (Pin if rule broken) 
- Owner (Pin if problem) 
- sachitshah_63900

Please enter the role IDs to ping, comma separated (or leave empty to enter custom IDs):`;

    // Show confirmation dialog
    if (confirm(roleSelectionMessage)) {
      // Default set of roles when the emergency button is clicked
      // These should be real Discord role IDs
      const emergencyRoleIDs = prompt(
        "Enter moderator role IDs to ping (comma separated):", 
        // These are the role IDs for the roles specified by the user:
        // - MOD (Pin if rule broken)
        // - Owner (Pin if problem)
        // - sachitshah_63900 (user)
        "1253928067198357577,1253928067198357578,1253928067198357580"
      );
      
      if (emergencyRoleIDs) {
        // Set the roles to ping
        const rolesToPing = emergencyRoleIDs.split(',').map(id => id.trim());
        setModeratorRoles(rolesToPing);
        
        // Show which roles will be pinged
        const roleCount = rolesToPing.length;
        toast({
          title: "Emergency Procedure Initiated",
          description: `Will ping ${roleCount} role${roleCount !== 1 ? 's' : ''} during the emergency notification.`,
        });
        
        // Start the emergency backup process
        setIsEmergencyBackup(true);
        emergencyBackupMutation.mutate();
      } else {
        toast({
          title: "Emergency Cancelled",
          description: "No role IDs provided. Emergency procedure cancelled.",
          variant: "destructive",
        });
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="min-h-screen bg-discord-bg-dark text-discord-text-normal">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <div className="w-16 md:w-60 h-screen bg-[#2F3136] flex-shrink-0 flex flex-col">
          <div className="p-3 md:p-4 border-b border-[#202225]">
            <h1 className="text-white font-bold hidden md:block">
              SpeedCube Scrambler
            </h1>
            <div className="md:hidden flex justify-center">
              <span className="text-white text-xl">
                <i className="fas fa-cube"></i>
              </span>
            </div>
          </div>

          <div className="p-2 flex-grow overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-[#A3A6AA] text-xs uppercase ml-2 mb-1 hidden md:block">
                Bot Controls
              </h2>
              <div
                className={`flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer text-[#DCDDDE] ${
                  selectedTab === "bot" ? "bg-[#5865F2] text-white" : ""
                }`}
                onClick={() => setSelectedTab("bot")}
              >
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-robot"></i>
                </span>
                <span className="hidden md:block">Bot Status</span>
              </div>
              <div
                className={`flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer text-[#DCDDDE] ${
                  selectedTab === "schedule" ? "bg-[#5865F2] text-white" : ""
                }`}
                onClick={() => setSelectedTab("schedule")}
              >
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-calendar-alt"></i>
                </span>
                <span className="hidden md:block">Schedule</span>
              </div>
              <div
                className={`flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer text-[#DCDDDE] ${
                  selectedTab === "threads" ? "bg-[#5865F2] text-white" : ""
                }`}
                onClick={() => setSelectedTab("threads")}
              >
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-comments"></i>
                </span>
                <span className="hidden md:block">Threads</span>
              </div>
              <div
                className={`flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer text-[#DCDDDE] ${
                  selectedTab === "analytics" ? "bg-[#5865F2] text-white" : ""
                }`}
                onClick={() => setSelectedTab("analytics")}
              >
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-chart-line"></i>
                </span>
                <span className="hidden md:block">Analytics</span>
              </div>
              <div
                className={`flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer text-[#DCDDDE] ${
                  selectedTab === "settings" ? "bg-[#5865F2] text-white" : ""
                }`}
                onClick={() => setSelectedTab("settings")}
              >
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cog"></i>
                </span>
                <span className="hidden md:block">Settings</span>
              </div>
            </div>

            <div className="mb-4">
              <h2 className="text-[#A3A6AA] text-xs uppercase ml-2 mb-1 hidden md:block">
                Cube Types
              </h2>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">3x3</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">2x2</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">3x3 BLD</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">3x3 OH</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">Skewb</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-cube"></i>
                </span>
                <span className="hidden md:block">Pyraminx</span>
              </div>

              <div className="flex items-center p-2 rounded hover:bg-[#36393F] cursor-pointer mb-1 text-discord-text-normal">
                <span className="mr-3 text-[#A3A6AA]">
                  <i className="fas fa-clock"></i>
                </span>
                <span className="hidden md:block">Clock</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#202225]">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white mr-2">
                <i className="fas fa-robot"></i>
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-semibold text-white">CubeBot</div>
                <div className="text-xs text-[#A3A6AA]">
                  {healthData?.botStatus === "online" ? "Online" : "Offline"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Channel Header */}
          <div className="h-12 border-b border-[#202225] flex items-center px-4">
            <span className="mr-2 text-[#A3A6AA]">#</span>
            <span className="font-bold">🗓•daily-scramble</span>
            <div className="ml-2 text-xs text-[#A3A6AA] bg-[#2F3136] py-0.5 px-2 rounded">
              Daily Scrambles at 4:00 PM IST
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {selectedTab === "bot" && (
              <>
                {/* Bot Info Card */}
                <Card className="bg-[#2F3136] rounded-md mb-6 border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start">
                      <div className="w-12 h-12 rounded-full bg-[#5865F2] flex items-center justify-center text-white mr-4 flex-shrink-0">
                        <i className="fas fa-robot text-2xl"></i>
                      </div>
                      <div>
                        <h2 className="text-white font-bold text-lg mb-1">
                          SpeedCube Scrambler Bot
                        </h2>
                        <p className="text-[#DCDDDE] mb-2">
                          This bot posts daily scramble challenges for different
                          cube types based on the day of the week. At exactly 4:00 PM IST,
                          the bot first cleans up all existing threads and then immediately
                          creates the new daily challenge. This ensures a clean slate for
                          each day's challenge.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span className="bg-[#202225] text-xs px-2 py-1 rounded">
                            <i className="fas fa-calendar-alt mr-1"></i> Daily
                            Challenges
                          </span>
                          <span className="bg-[#202225] text-xs px-2 py-1 rounded">
                            <i className="fas fa-chart-line mr-1"></i> Analytics
                          </span>
                          <Button 
                            className="bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs px-2 py-1 rounded"
                            onClick={() => createTestThread()}
                            disabled={isCreatingTestThread}
                          >
                            {isCreatingTestThread ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-1"></i> Creating...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-plus-circle mr-1"></i> Create Test Thread
                              </>
                            )}
                          </Button>
                          <Button 
                            className="bg-[#EB459E] hover:bg-[#C03B84] text-white text-xs px-2 py-1 rounded"
                            onClick={() => triggerDailyPost()}
                            disabled={isTriggeringDailyPost}
                          >
                            {isTriggeringDailyPost ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-1"></i> Triggering...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-bolt mr-1"></i> Trigger Daily Post
                              </>
                            )}
                          </Button>
                          <span className="bg-[#202225] text-xs px-2 py-1 rounded">
                            <i className="fas fa-cube mr-1"></i> Multiple Cube
                            Types
                          </span>
                          <Button 
                            className="bg-[#5B73A0] hover:bg-[#495C82] text-white text-xs px-2 py-1 rounded"
                            onClick={() => cleanupThreads()}
                            disabled={isCleaningThreads}
                          >
                            {isCleaningThreads ? (
                              <>
                                <i className="fas fa-spinner fa-spin mr-1"></i> Cleaning...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-broom mr-1"></i> Manual Thread Cleanup
                              </>
                            )}
                          </Button>
                          <span className="bg-[#202225] text-xs px-2 py-1 rounded">
                            <i className="fas fa-clock mr-1"></i> Auto Cleanup
                            Before Posting
                          </span>
                          
                          <div className="w-full border-t border-[#202225] my-2"></div>
                          
                          <div className="mt-2">
                            <h3 className="text-white font-semibold text-sm mb-2">Security Controls</h3>
                            
                            <div className="flex flex-wrap gap-2 mb-3">
                              <Button 
                                className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-1 rounded"
                                onClick={() => performSecurityCheck()}
                                disabled={isSecurityCheck}
                              >
                                {isSecurityCheck ? (
                                  <>
                                    <i className="fas fa-spinner fa-spin mr-1"></i> Security Check In Progress...
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-shield-alt mr-1"></i> Perform Security Check
                                  </>
                                )}
                              </Button>
                              <p className="text-[#A3A6AA] text-xs w-full mt-1">
                                Runs security checks silently without sending notifications or restarting the application.
                              </p>
                            </div>
                            
                            <h3 className="text-white font-semibold text-sm mb-2">Emergency Controls</h3>
                            <Button 
                              className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
                              onClick={() => triggerEmergencyBackup()}
                              disabled={isEmergencyBackup}
                            >
                              {isEmergencyBackup ? (
                                <>
                                  <i className="fas fa-spinner fa-spin mr-1"></i> Emergency In Progress...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-exclamation-triangle mr-1"></i> Emergency Backup & Restart
                                </>
                              )}
                            </Button>
                            <p className="text-[#A3A6AA] text-xs mt-1">
                              ⚠️ Use only in emergency situations. This will backup data, perform security checks, ping moderators, and restart the entire application.
                            </p>
                            <div className="bg-[#202225] rounded p-2 mt-2">
                              <h4 className="text-white text-xs font-semibold mb-1">Roles that will be pinged:</h4>
                              <ul className="text-[#A3A6AA] text-xs space-y-1 pl-4 list-disc">
                                <li>@MOD (Pin if rule broken)</li>
                                <li>@Owner (Pin if problem)</li>
                                <li>@sachitshah_63900</li>
                              </ul>
                              <p className="text-[#A3A6AA] text-xs mt-2">You will be prompted to confirm the role IDs before pinging.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Bot Status */}
                <div className="mb-6">
                  <h3 className="text-white font-semibold mb-2">Bot Status</h3>
                  <Card className="bg-[#2F3136] border-0">
                    <CardContent className="p-4">
                      <div className="flex items-center mb-4">
                        <div
                          className={`w-3 h-3 rounded-full mr-2 ${
                            healthData?.botStatus === "online"
                              ? "bg-[#57F287]"
                              : "bg-[#ED4245]"
                          }`}
                        ></div>
                        <span className="text-white font-medium">
                          {healthData?.botStatus === "online"
                            ? "Online"
                            : "Offline"}
                        </span>
                      </div>

                      <div className="mt-4">
                        <h4 className="text-white font-medium mb-2">
                          Next Challenge
                        </h4>
                        {nextChallengeLoading ? (
                          <div className="text-[#A3A6AA]">Loading...</div>
                        ) : (
                          <div className="bg-[#202225] p-3 rounded-md">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-white font-medium">
                                {nextChallengeData?.day}{" "}
                                {nextChallengeData?.cubeType} Challenge
                              </span>
                              <Badge
                                className={
                                  nextChallengeData?.isToday
                                    ? "bg-[#57F287]"
                                    : "bg-[#FEE75C] text-black"
                                }
                              >
                                {nextChallengeData?.isToday
                                  ? "Today"
                                  : "Tomorrow"}
                              </Badge>
                            </div>
                            <div className="text-[#A3A6AA] text-sm">
                              Scheduled for{" "}
                              <span className="text-white">
                                {nextChallengeData?.nextTime}
                              </span>{" "}
                              (in {nextChallengeData?.timeUntil})
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {selectedTab === "schedule" && (
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-2">
                  Weekly Schedule
                </h3>
                <Card className="bg-[#2F3136] border-0">
                  <CardContent className="p-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-[#202225]">
                          <TableHead className="text-[#A3A6AA]">Day</TableHead>
                          <TableHead className="text-[#A3A6AA]">
                            Cube Type
                          </TableHead>
                          <TableHead className="text-[#A3A6AA]">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">Monday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              Skewb
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">Tuesday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              3x3 BLD
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">
                            Wednesday
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              2x2
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">Thursday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              3x3
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">Friday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              Pyraminx
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow className="border-b border-[#202225]">
                          <TableCell className="text-white">Saturday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              3x3 OH
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-white">Sunday</TableCell>
                          <TableCell>
                            <Badge className="bg-[#202225] text-[#DCDDDE]">
                              Clock
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[#DCDDDE]">
                            4:00 PM IST
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <h3 className="text-white font-semibold mt-6 mb-2">
                  Message Emulator
                </h3>
                <Card className="bg-[#2F3136] border-0">
                  <CardContent className="p-4">
                    <DiscordMessageEmulator />
                  </CardContent>
                </Card>
              </div>
            )}

            {selectedTab === "analytics" && (
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-2">Analytics Dashboard</h3>
                <Card className="bg-[#2F3136] border-0">
                  <CardContent className="p-4">
                    <p className="text-[#DCDDDE] mb-4">
                      Real-time performance analytics are now available directly through the Discord command system. 
                      Use the following commands to access analytics data:
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <Card className="bg-[#202225] border-0 p-3">
                        <div className="flex items-center mb-2">
                          <span className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white mr-3">
                            <i className="fas fa-chart-line"></i>
                          </span>
                          <h4 className="text-white font-medium">Command Analytics</h4>
                        </div>
                        <p className="text-[#DCDDDE] text-sm mb-2">
                          View analytics on command usage patterns, frequency, and user activity.
                        </p>
                        <div className="bg-[#2F3136] rounded p-2 mt-2">
                          <code className="text-[#57F287] text-xs">/analytics type:commands</code>
                        </div>
                      </Card>
                      
                      <Card className="bg-[#202225] border-0 p-3">
                        <div className="flex items-center mb-2">
                          <span className="w-8 h-8 rounded-full bg-[#FEE75C] flex items-center justify-center text-[#2F3136] mr-3">
                            <i className="fas fa-microchip"></i>
                          </span>
                          <h4 className="text-white font-medium">System Performance</h4>
                        </div>
                        <p className="text-[#DCDDDE] text-sm mb-2">
                          Monitor system health, memory usage, and resource utilization.
                        </p>
                        <div className="bg-[#2F3136] rounded p-2 mt-2">
                          <code className="text-[#57F287] text-xs">/analytics type:system</code>
                        </div>
                      </Card>
                      
                      <Card className="bg-[#202225] border-0 p-3">
                        <div className="flex items-center mb-2">
                          <span className="w-8 h-8 rounded-full bg-[#EB459E] flex items-center justify-center text-white mr-3">
                            <i className="fas fa-stopwatch"></i>
                          </span>
                          <h4 className="text-white font-medium">Solve Time Analytics</h4>
                        </div>
                        <p className="text-[#DCDDDE] text-sm mb-2">
                          Analyze solve performance metrics by cube type and user.
                        </p>
                        <div className="bg-[#2F3136] rounded p-2 mt-2">
                          <code className="text-[#57F287] text-xs">/analytics type:solves</code>
                          <p className="text-[#DCDDDE] text-xs mt-1">Filter by cube type with the cube_type parameter</p>
                        </div>
                      </Card>
                      
                      <Card className="bg-[#202225] border-0 p-3">
                        <div className="flex items-center mb-2">
                          <span className="w-8 h-8 rounded-full bg-[#57F287] flex items-center justify-center text-white mr-3">
                            <i className="fas fa-calendar-day"></i>
                          </span>
                          <h4 className="text-white font-medium">Daily Activity</h4>
                        </div>
                        <p className="text-[#DCDDDE] text-sm mb-2">
                          Track daily usage patterns, challenge participation, and user engagement.
                        </p>
                        <div className="bg-[#2F3136] rounded p-2 mt-2">
                          <code className="text-[#57F287] text-xs">/analytics type:daily</code>
                        </div>
                      </Card>
                    </div>
                    
                    <Card className="bg-[#202225] border-0 p-3 mb-4">
                      <div className="flex items-center mb-2">
                        <span className="w-8 h-8 rounded-full bg-[#3498DB] flex items-center justify-center text-white mr-3">
                          <i className="fas fa-tachometer-alt"></i>
                        </span>
                        <h4 className="text-white font-medium">Complete Dashboard</h4>
                      </div>
                      <p className="text-[#DCDDDE] text-sm mb-2">
                        View a complete overview of all analytics metrics in one place.
                      </p>
                      <div className="bg-[#2F3136] rounded p-2 mt-2">
                        <code className="text-[#57F287] text-xs">/analytics type:overview</code>
                      </div>
                    </Card>
                    
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-amber-200">
                      <div className="flex items-start">
                        <i className="fas fa-lightbulb mt-1 mr-2"></i>
                        <div>
                          <h5 className="font-medium mb-1">Pro Tip</h5>
                          <p className="text-sm">
                            You can control how many entries to display by using the <code className="bg-[#2F3136] px-1 rounded">limit</code> parameter. 
                            For example: <code className="bg-[#2F3136] px-1 rounded">/analytics type:commands limit:20</code>
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {selectedTab === "settings" && (
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-2">
                  Bot Settings
                </h3>
                <Card className="bg-[#2F3136] border-0">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[#DCDDDE] text-sm font-medium mb-1">
                          Discord Guild ID
                        </label>
                        <Input
                          className="bg-[#202225] border-[#202225] text-white placeholder:text-[#72767D]"
                          placeholder="Enter the Discord Guild ID"
                          value={guildId}
                          onChange={(e) => setGuildId(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[#DCDDDE] text-sm font-medium mb-1">
                          Channel ID for #🗓•daily-scramble
                        </label>
                        <Input
                          className="bg-[#202225] border-[#202225] text-white placeholder:text-[#72767D]"
                          placeholder="Enter the Channel ID"
                          value={channelId}
                          onChange={(e) => setChannelId(e.target.value)}
                        />
                      </div>
                      <div className="pt-2">
                        <Button
                          className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                          onClick={() => {
                            if (!guildId || !channelId) {
                              toast({
                                title: "Missing Information",
                                description: "Please enter both Guild ID and Channel ID.",
                                variant: "destructive"
                              });
                              return;
                            }
                            
                            configMutation.mutate({ guildId, channelId });
                          }}
                          disabled={configMutation.isPending}
                        >
                          {configMutation.isPending ? "Saving..." : "Save Settings"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {selectedTab === "threads" && (
              <div className="mb-6">
                <h3 className="text-white font-semibold mb-2">
                  Challenge Threads
                </h3>
                <Card className="bg-[#2F3136] border-0">
                  <CardContent className="p-4">
                    {threadsLoading ? (
                      <div className="text-[#A3A6AA]">Loading threads...</div>
                    ) : threadsData?.length === 0 ? (
                      <div className="text-[#A3A6AA]">
                        No challenge threads yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {threadsData?.map((thread: ChallengeThread) => (
                          <div
                            key={thread.id}
                            className="bg-[#36393F] p-3 rounded-md"
                          >
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white mr-3 flex-shrink-0">
                                <i className="fas fa-robot"></i>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center">
                                  <span className="font-medium text-white">
                                    {thread.cubeType} Challenge
                                  </span>
                                  <Badge
                                    className={
                                      thread.isDeleted
                                        ? "ml-2 bg-[#202225] text-[#A3A6AA]"
                                        : new Date(thread.expiresAt) <
                                          new Date(
                                            Date.now() + 1000 * 60 * 60
                                          )
                                        ? "ml-2 bg-[#FEE75C] text-black"
                                        : "ml-2 bg-[#57F287] text-white"
                                    }
                                  >
                                    {thread.isDeleted
                                      ? "Deleted"
                                      : new Date(thread.expiresAt) <
                                        new Date(Date.now() + 1000 * 60 * 60)
                                      ? "Ending Soon"
                                      : "Active"}
                                  </Badge>
                                </div>
                                <div className="text-xs text-[#A3A6AA]">
                                  Created{" "}
                                  {formatDate(thread.createdAt.toString())} •
                                  Expires{" "}
                                  {formatDate(thread.expiresAt.toString())}
                                </div>
                                <div className="mt-2 font-mono text-sm bg-[#202225] p-2 rounded overflow-x-auto">
                                  {thread.scramble}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
