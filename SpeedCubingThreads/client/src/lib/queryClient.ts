import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Get the auth token from localStorage
const TOKEN_STORAGE_KEY = "speedcube_auth_token";

function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Create a detailed log for debugging authentication issues
  console.log(`Making ${method} request to ${url}`);
  
  // Use consistent headers across all requests
  const headers: Record<string, string> = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json"
  };
  
  // Add content type for requests with body
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add auth token if it exists
  const token = getAuthToken();
  if (token) {
    console.log("Adding auth token to request");
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.log("No auth token available");
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store"
  });

  // Log the response status
  console.log(`Response from ${url}: status ${res.status}`);
  
  if (!res.ok) {
    console.error(`Error response from ${url}:`, res.status, res.statusText);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    console.log(`Making query request to ${url}`);
    
    // Build headers with authentication token if available
    const headers: Record<string, string> = {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json"
    };
    
    // Add auth token if it exists
    const token = getAuthToken();
    if (token) {
      console.log("Adding auth token to query request");
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      console.log("No auth token available for query");
    }
    
    // Make the request
    const res = await fetch(url, {
      headers,
      cache: "no-store"
    });

    console.log(`Response from ${url}: status ${res.status}`);
    
    // Handle unauthorized based on configuration
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      console.log(`Auth required for ${url} but returning null as configured`);
      return null;
    }

    if (!res.ok) {
      console.error(`Error response from ${url}:`, res.status, res.statusText);
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
