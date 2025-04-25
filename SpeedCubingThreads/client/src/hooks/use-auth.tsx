import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User, loginSchema } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

// Define our token response interface that matches our new JWT auth
interface TokenResponse {
  token: string;
  user: User;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<TokenResponse, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
};

type LoginData = z.infer<typeof loginSchema>;

// Token storage helpers
const TOKEN_STORAGE_KEY = "speedcube_auth_token";

function saveToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  // Set the authorization header on app load if we have a token
  useEffect(() => {
    const token = getToken();
    if (token) {
      console.log("Loaded token from localStorage");
    }
  }, []);
  
  const {
    data: user,
    error,
    isLoading,
    refetch,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/auth/user"],
    queryFn: async ({ queryKey }) => {
      const url = queryKey[0] as string;
      const token = getToken();
      
      // If no token, return null (not authenticated)
      if (!token) {
        console.log("No auth token found");
        return null;
      }
      
      try {
        console.log("Authenticating with token");
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (res.status === 401) {
          console.log("Token invalid or expired");
          clearToken();
          return null;
        }
        
        if (!res.ok) {
          throw new Error(`Error: ${res.status}`);
        }
        
        return await res.json();
      } catch (err) {
        console.error("Auth error:", err);
        return null;
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData): Promise<TokenResponse> => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (data: TokenResponse) => {
      // Save the token
      saveToken(data.token);
      console.log("Token saved to localStorage");
      
      // Update the user in query cache
      queryClient.setQueryData(["/api/auth/user"], data.user);
      
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // With JWT, we just need to remove the token on the client side
      clearToken();
    },
    onSuccess: () => {
      // Clear user data from cache
      queryClient.setQueryData(["/api/auth/user"], null);
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}