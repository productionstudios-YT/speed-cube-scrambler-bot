// Simple test script for the emoji persistence feature

import { promises as fs } from 'fs';

async function testEmojiPersistence() {
  try {
    console.log("=== EMOJI PERSISTENCE TEST ===");
    
    // 1. Test creating an emoji config file
    const testEmojiMap = {
      '2x2': '🎲',
      '3x3': '🧩',
      'Pyraminx': '🔺',
      'Skewb': '💎',
      'Clock': '⏰',
      '3x3 BLD': '😎',
      '3x3 OH': '👋'
    };
    
    console.log("1. Writing test emoji config to file...");
    await fs.writeFile('./emoji-config.json', JSON.stringify(testEmojiMap, null, 2));
    console.log("✅ Emoji config written to file successfully");
    
    // 2. Test reading the emoji config file
    console.log("\n2. Reading emoji config from file...");
    const configData = await fs.readFile('./emoji-config.json', 'utf8');
    const loadedConfig = JSON.parse(configData);
    console.log("✅ Emoji config loaded:", loadedConfig);
    
    // 3. Verify contents match
    console.log("\n3. Verifying content...");
    const allMatch = Object.entries(testEmojiMap).every(
      ([key, value]) => loadedConfig[key] === value
    );
    
    if (allMatch && Object.keys(testEmojiMap).length === Object.keys(loadedConfig).length) {
      console.log("✅ Verification successful! All emoji mappings match");
    } else {
      console.error("❌ Verification failed! Emoji mappings don't match");
      console.log("Original:", testEmojiMap);
      console.log("Loaded:", loadedConfig);
    }
    
    console.log("\n=== TEST COMPLETE ===");
    
  } catch (error) {
    console.error("Error during test:", error);
  }
}

// Run the test
testEmojiPersistence();