/**
 * Simple self-pinger to keep the Replit environment awake
 * This module will periodically ping the application's keep-alive endpoint
 */

// Function to ping the keep-alive endpoint
async function pingKeepAlive() {
  try {
    // Use a relative URL to avoid hostname resolution issues
    const url = 'http://localhost:5000/keep-alive';
    
    console.log(`Pinging keep-alive endpoint at ${url}...`);
    
    // Make a simple fetch request to the keep-alive endpoint
    const response = await fetch(url);
    
    if (response.ok) {
      console.log(`Keep-alive ping successful: ${await response.text()}`);
    } else {
      console.error(`Keep-alive ping failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error in keep-alive ping:', error);
    // Even if ping fails, the service continues to run
    console.log('Keep-alive service will continue attempting pings');
  }
}

// Setup an interval to ping every 5 minutes (300000 ms)
// This prevents Replit from putting the application to sleep
const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes

setInterval(pingKeepAlive, PING_INTERVAL);

// Also ping immediately on startup
pingKeepAlive();

console.log(`Keep-alive service started. Will ping every ${PING_INTERVAL / 1000 / 60} minutes.`);

export const keepAliveActive = true;