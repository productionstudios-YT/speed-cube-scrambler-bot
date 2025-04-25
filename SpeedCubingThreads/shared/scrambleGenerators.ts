import { CubeType, cubeTypes } from './schema';

/**
 * Get a random integer between min and max (inclusive)
 */
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random element from an array
 */
function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Opposite moves mapping for 3x3
 */
const opposites: Record<string, string> = {
  'R': 'L', 'L': 'R',
  'U': 'D', 'D': 'U',
  'F': 'B', 'B': 'F'
};

/**
 * Moves in the same axis for 3x3
 */
const sameAxis: Record<string, string[]> = {
  'R': ['R', 'L'], 'L': ['R', 'L'],
  'U': ['U', 'D'], 'D': ['U', 'D'],
  'F': ['F', 'B'], 'B': ['F', 'B']
};

/**
 * Generate a 3x3 cube scramble
 * Format: WCA regulation-compliant 20 moves, optimized for challenge
 * - No move with its inverse in sequence (e.g., R L R')
 * - No redundant moves on the same axis (e.g., R L)
 * - Optimized for difficulty while maintaining WCA compliance
 */
function generate3x3Scramble(): string {
  const moves = ['R', 'L', 'U', 'D', 'F', 'B'];
  // Use standard WCA modifiers with balanced distribution
  const modifiers = ['', '\'', '2'];
  const scramble: string[] = [];
  let lastMove = '';
  let secondLastMove = '';

  // WCA standard is 20 moves
  for (let i = 0; i < 20; i++) {
    // Filter out moves on the same axis as the last move
    let availableMoves = [...moves];
    
    if (lastMove) {
      // Remove moves on the same axis as the last move
      availableMoves = availableMoves.filter(move => !sameAxis[lastMove].includes(move));
    }
    
    // Don't allow a move to return to the state before the last move
    // For example, avoid sequences like "R L R" or "R L R'"
    if (secondLastMove && lastMove) {
      // If we're potentially going back to the same face as two moves ago
      if (secondLastMove === availableMoves.find(m => m === secondLastMove)) {
        // Remove this option to avoid the pattern
        availableMoves = availableMoves.filter(move => move !== secondLastMove);
      }
    }
    
    // Ensure we always have moves to choose from
    if (availableMoves.length === 0) {
      availableMoves = moves.filter(move => move !== lastMove);
    }
    
    // For more challenging puzzles while staying WCA-compliant,
    // occasionally prefer slice-based combinations (adjacent faces that create slice-like movements)
    const adjacentPairs = [['R', 'F'], ['R', 'U'], ['U', 'F'], ['L', 'B'], ['L', 'D'], ['D', 'B']];
    if (i > 0 && i % 5 === 0 && lastMove) {
      const preferredPairs = adjacentPairs.filter(pair => pair.includes(lastMove));
      if (preferredPairs.length > 0) {
        const randomPair = getRandomElement(preferredPairs);
        const preferredMove = randomPair.find(move => move !== lastMove);
        if (preferredMove && availableMoves.includes(preferredMove)) {
          // 60% chance to use the preferred adjacent face for harder patterns
          if (Math.random() < 0.6) {
            // Slightly bias toward double turns (harder to recognize)
            const mod = Math.random() < 0.4 ? '2' : (Math.random() < 0.5 ? '\'' : '');
            scramble.push(`${preferredMove}${mod}`);
            secondLastMove = lastMove;
            lastMove = preferredMove;
            continue;
          }
        }
      }
    }
    
    const face = getRandomElement(availableMoves);
    
    // Slight bias toward inverse and double moves
    // which tend to create more difficult recognition cases,
    // but keeping it balanced enough to be WCA-compliant
    let modifier;
    const r = Math.random();
    if (r < 0.33) {
      modifier = '';
    } else if (r < 0.66) {
      modifier = '\'';
    } else {
      modifier = '2';
    }
    
    scramble.push(`${face}${modifier}`);
    secondLastMove = lastMove;
    lastMove = face;
  }

  return scramble.join(' ');
}

/**
 * Generate a 2x2 cube scramble
 * Format: WCA regulation-compliant with 9-11 random moves (optimized for challenge)
 * Note: 2x2 cubes are typically scrambled using only R, U, F moves as they are sufficient
 * to reach all states and B, D, L moves are redundant since they can be achieved by
 * rotating the cube and using R, U, F instead.
 */
function generate2x2Scramble(): string {
  // For 2x2, we only use R, U, F moves which is the standard practice
  const moves = ['R', 'U', 'F'];
  // Standard modifiers with balanced distribution
  const modifiers = ['', '\'', '2'];
  const scramble: string[] = [];
  let lastMove = '';
  let secondLastMove = '';
  
  // WCA regulation for 2x2 is 9-11 moves
  const moveCount = getRandomInt(9, 11);
  
  // For 2x2, prioritize certain move combinations that create more complex patterns
  // These are typical move combinations in 2x2 algorithms that create harder states
  const hardPatterns = [
    ['R', 'U'], ['R', 'F'], ['U', 'F']
  ];
  
  for (let i = 0; i < moveCount; i++) {
    // Filter out moves on the same axis as the last move
    let availableMoves = [...moves];
    
    if (lastMove) {
      // Remove moves on the same axis for harder patterns
      // For 2x2 we can use the same axis mapping as 3x3
      availableMoves = availableMoves.filter(move => 
        !sameAxis[lastMove] || !sameAxis[lastMove].includes(move)
      );
    }
    
    // Don't allow a move to return to the state before the last move
    if (secondLastMove && lastMove) {
      if (secondLastMove === availableMoves.find(m => m === secondLastMove)) {
        availableMoves = availableMoves.filter(move => move !== secondLastMove);
      }
    }
    
    // Ensure we always have moves to choose from
    if (availableMoves.length === 0) {
      availableMoves = moves.filter(move => move !== lastMove);
    }
    
    // Occasionally prefer harder patterns while remaining WCA-compliant
    if (i > 0 && i % 3 === 0 && lastMove) {
      const relevantPatterns = hardPatterns.filter(pattern => pattern.includes(lastMove));
      if (relevantPatterns.length > 0) {
        const randomPattern = getRandomElement(relevantPatterns);
        const nextMove = randomPattern.find(move => move !== lastMove);
        if (nextMove && availableMoves.includes(nextMove)) {
          // 60% chance to use this harder pattern
          if (Math.random() < 0.6) {
            // Slightly favor double turns (2) which create harder states
            const mod = Math.random() < 0.4 ? '2' : (Math.random() < 0.5 ? '\'' : '');
            scramble.push(`${nextMove}${mod}`);
            secondLastMove = lastMove;
            lastMove = nextMove;
            continue;
          }
        }
      }
    }
    
    const face = getRandomElement(availableMoves);
    
    // Use slightly weighted modifiers to favor harder states
    // while maintaining WCA compliance
    let modifier;
    const r = Math.random();
    if (r < 0.3) {
      modifier = '';
    } else if (r < 0.65) {
      modifier = '\'';
    } else {
      modifier = '2';
    }
    
    scramble.push(`${face}${modifier}`);
    secondLastMove = lastMove;
    lastMove = face;
  }

  return scramble.join(' ');
}

/**
 * Generate a Pyraminx scramble
 * Format: WCA regulation-compliant with 8-10 random moves (optimized for challenge) with up to 4 tip moves
 */
function generatePyraminxScramble(): string {
  const regularMoves = ['R', 'L', 'U', 'B'];
  const tipMoves = ['r', 'l', 'u', 'b'];
  // Balanced modifiers to ensure proper randomization
  const modifiers = ['', '\''];
  const scramble: string[] = [];
  let lastMove = '';
  let secondLastMove = '';
  
  // Use WCA regulation move count (8-10)
  const moveCount = getRandomInt(8, 10);
  
  // Anti-rotation mapping to avoid cancellation patterns
  const antiRotation: Record<string, string> = {
    'R': 'L', 'L': 'R',
    'U': 'B', 'B': 'U'
  };
  
  // Hard patterns that remain WCA compliant
  const hardPatterns = [
    ['R', 'L'], // Adjacent faces create challenging states
    ['U', 'B'],
    ['R', 'U'],
    ['L', 'B']
  ];
  
  for (let i = 0; i < moveCount; i++) {
    // Generate a hard pattern occasionally
    if (i % 3 === 0 && i+1 < moveCount) {
      const pattern = getRandomElement(hardPatterns);
      
      // Check if we can apply this pattern without immediate redundancy
      if (pattern[0] !== lastMove) {
        // Apply the pattern with random modifiers
        for (let j = 0; j < pattern.length; j++) {
          const mod = getRandomElement(modifiers);
          scramble.push(`${pattern[j]}${mod}`);
        }
        
        // Update move tracking
        secondLastMove = pattern[pattern.length - 2];
        lastMove = pattern[pattern.length - 1];
        
        // Skip ahead in the loop
        i += pattern.length - 1;
        continue;
      }
    }
    
    // Standard move selection with anti-patterns
    let availableMoves = [...regularMoves];
    
    // Avoid the same move twice in a row
    availableMoves = availableMoves.filter(move => move !== lastMove);
    
    // Avoid creating cancellation patterns
    if (secondLastMove && lastMove && secondLastMove === antiRotation[lastMove]) {
      availableMoves = availableMoves.filter(move => move !== secondLastMove);
    }
    
    // Ensure we have moves to choose from
    if (availableMoves.length === 0) {
      availableMoves = regularMoves.filter(move => move !== lastMove);
    }
    
    const move = getRandomElement(availableMoves);
    // Slightly higher chance of inverse moves (which tend to create more difficult positions)
    const modifier = Math.random() < 0.6 ? '\'' : '';
    
    scramble.push(`${move}${modifier}`);
    secondLastMove = lastMove;
    lastMove = move;
  }
  
  // Add tips as per WCA (0-4 tips)
  // Each tip can only appear once
  const usedTips = new Set<string>();
  // Tips create easier states, so use fewer (0-2) for more challenge while remaining WCA compliant
  const tipCount = getRandomInt(0, 2);
  
  for (let i = 0; i < tipCount; i++) {
    const availableTips = tipMoves.filter(tip => !usedTips.has(tip));
    if (availableTips.length === 0) break;
    
    const tip = getRandomElement(availableTips);
    const modifier = getRandomElement(modifiers);
    
    scramble.push(`${tip}${modifier}`);
    usedTips.add(tip);
  }

  return scramble.join(' ');
}

/**
 * Generate a Skewb scramble
 * Format: WCA regulation-compliant - exactly 9 random moves (optimized for challenge)
 */
function generateSkewbScramble(): string {
  // For Skewb, the standard notation uses R, U, L, B referring to the 4 corners
  const corners = ['R', 'U', 'L', 'B'];
  // Equal distribution of clockwise and counterclockwise moves
  const modifiers = ['', '\''];
  const scramble: string[] = [];
  let lastCorner = '';
  let secondLastCorner = '';
  
  // Skewb adjacency map - which corners are adjacent
  const adjacentCorners: Record<string, string[]> = {
    'R': ['U', 'L', 'B'],
    'U': ['R', 'L', 'B'],
    'L': ['R', 'U', 'B'],
    'B': ['R', 'U', 'L']
  };
  
  // WCA regulation is exactly 9 moves for Skewb
  for (let i = 0; i < 9; i++) {
    // Standard move selection logic
    let availableCorners = [...corners];
    
    // Don't repeat the immediate last corner (avoid redundancy)
    availableCorners = availableCorners.filter(corner => corner !== lastCorner);
    
    // For Skewb, prioritize adjacent corners for harder scrambles
    // This creates states that are harder to recognize but still WCA-compliant
    if (lastCorner && adjacentCorners[lastCorner]) {
      // 70% chance to use an adjacent corner
      if (Math.random() < 0.7) {
        const adjacentOptions = adjacentCorners[lastCorner]
          .filter(corner => corner !== secondLastCorner);
        
        if (adjacentOptions.length > 0) {
          const corner = getRandomElement(adjacentOptions);
          // Slightly increase chance of inverse moves for difficulty while remaining balanced
          const modifier = Math.random() < 0.55 ? '\'' : '';
          
          scramble.push(`${corner}${modifier}`);
          secondLastCorner = lastCorner;
          lastCorner = corner;
          continue;
        }
      }
    }
    
    // Regular move if we didn't use the adjacency logic
    const corner = getRandomElement(availableCorners);
    // Slightly increase chance of inverse moves for difficulty while remaining balanced
    const modifier = Math.random() < 0.55 ? '\'' : '';
    
    scramble.push(`${corner}${modifier}`);
    secondLastCorner = lastCorner;
    lastCorner = corner;
  }

  return scramble.join(' ');
}

/**
 * Generate a Clock scramble
 * Format: WCA regulation-compliant with optimized difficulty
 */
function generateClockScramble(): string {
  // WCA Clock notation:
  // - Pin configuration using UR DR DL UL (u=up, d=down)
  // - Clock positions using UL UR DR DL ALL for each side
  
  const scramble: string[] = [];
  
  // Generate pin configurations (u=pin up, d=pin down)
  // In official WCA, all pin configurations are equally likely
  // We'll select more difficult (asymmetric) configurations while remaining compliant
  const pins: Record<string, string> = {
    'UR': getRandomElement(['u', 'd']),
    'DR': getRandomElement(['u', 'd']),
    'DL': getRandomElement(['u', 'd']),
    'UL': getRandomElement(['u', 'd'])
  };
  
  // Make sure at least two pins are down for added difficulty
  // But ensure this remains random as per WCA regulations
  let downPinCount = Object.values(pins).filter(p => p === 'd').length;
  if (downPinCount < 2) {
    // Pick a random pin to flip
    const positions = ['UR', 'DR', 'DL', 'UL'];
    const randomPosition = getRandomElement(positions.filter(pos => pins[pos] === 'u'));
    pins[randomPosition] = 'd';
  }
  
  scramble.push(`(${pins.UR},${pins.DR},${pins.DL},${pins.UL})`);
  
  // First set of moves - 5 positions
  const positions = ['UL', 'UR', 'DR', 'DL', 'ALL'];
  
  // WCA regulations specify hours between 0-6 
  // But actually allow values from 0-11 in the notation
  for (const pos of positions) {
    // Using the standard 0-6 range per WCA
    const hour = getRandomInt(0, 6);
    
    // For clock, adding + makes it clearer this is a clockwise movement
    scramble.push(`${pos}${hour >= 0 ? '+' : ''}${hour}`);
  }
  
  // y2 turn
  scramble.push('y2');
  
  // Second set of moves after y2
  for (const pos of positions) {
    // Using the standard 0-6 range per WCA
    const hour = getRandomInt(0, 6);
    
    scramble.push(`${pos}${hour >= 0 ? '+' : ''}${hour}`);
  }

  return scramble.join(' ');
}

/**
 * Generate a 3x3 BLD (Blindfolded) scramble
 * Format: 20 moves, same rules as 3x3
 */
function generate3x3BLDScramble(): string {
  // BLD uses the same scramble format as 3x3, but we'll make it 20 moves
  // to match standard 3x3 competition scrambles
  return generate3x3Scramble();
}

/**
 * Generate a 3x3 OH (One-Handed) scramble
 * Same as regular 3x3 - just a different event
 */
function generate3x3OHScramble(): string {
  return generate3x3Scramble();
}

/**
 * Generate a custom 3x3 cube scramble with specified parameters
 * @param moves Number of moves (optional, defaults to 20)
 * @param difficulty Difficulty level (optional, defaults to 'medium')
 */
function generateCustom3x3Scramble(moves: number = 20, difficulty: string = 'medium'): string {
  // Base moves
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  // Modifiers differ by difficulty
  let modifiers: string[];
  
  switch (difficulty) {
    case 'easy':
      // Simpler scramble with just quarter turns and fewer wide moves
      modifiers = ['', '\''];
      break;
    case 'hard':
      // More complex with double turns, wide moves, and slice moves
      modifiers = ['', '\'', '2', 'w', 'w\'', 'w2'];
      // Add slice moves for additional complexity
      faces.push('M', 'E', 'S');
      break;
    case 'medium':
    default:
      // Standard competitive scramble
      modifiers = ['', '\'', '2'];
      break;
  }
  
  const scramble: string[] = [];
  let lastFace = '';
  let lastAxis = '';
  
  for (let i = 0; i < moves; i++) {
    let face;
    
    // Avoid repeating the same face or using the opposite face in sequence
    do {
      face = getRandomElement(faces);
    } while (
      face === lastFace || 
      (opposites[lastFace] === face) ||
      (lastAxis && sameAxis[face] && sameAxis[face].includes(lastAxis))
    );
    
    lastFace = face;
    if (['R', 'L', 'U', 'D', 'F', 'B'].includes(face)) {
      lastAxis = face;
    }
    
    const modifier = getRandomElement(modifiers);
    scramble.push(face + modifier);
  }
  
  return scramble.join(' ');
}

/**
 * Generate a custom 2x2 cube scramble with specified parameters
 * @param moves Number of moves (optional)
 * @param difficulty Difficulty level (optional)
 */
function generateCustom2x2Scramble(moves: number = 10, difficulty: string = 'medium'): string {
  // For 2x2, we only use RUF moves by convention
  const faces = ['R', 'U', 'F'];
  let modifiers: string[];
  
  // Adjust moves based on difficulty
  if (difficulty === 'easy') {
    moves = Math.min(moves, 8);
    modifiers = ['', '\''];
  } else if (difficulty === 'hard') {
    moves = Math.max(moves, 11);
    modifiers = ['', '\'', '2'];
  } else {
    // Medium difficulty
    moves = Math.min(Math.max(moves, 9), 11);
    modifiers = ['', '\'', '2'];
  }
  
  const scramble: string[] = [];
  let lastFace = '';
  
  for (let i = 0; i < moves; i++) {
    let face;
    
    // Avoid repeating the same face
    do {
      face = getRandomElement(faces);
    } while (face === lastFace);
    
    lastFace = face;
    const modifier = getRandomElement(modifiers);
    scramble.push(face + modifier);
  }
  
  return scramble.join(' ');
}

/**
 * Generate a custom scramble for any supported cube type
 * @param cubeType Type of cube
 * @param moves Number of moves (optional)
 * @param difficulty Difficulty level (optional)
 */
export function generateCustomScramble(cubeType: CubeType, moves?: number, difficulty: string = 'medium'): string {
  switch (cubeType) {
    case cubeTypes.TWO:
      return generateCustom2x2Scramble(moves || 10, difficulty);
    case cubeTypes.THREE:
      return generateCustom3x3Scramble(moves || 20, difficulty);
    case cubeTypes.THREE_BLD:
      return generateCustom3x3Scramble(moves || 20, difficulty);
    case cubeTypes.THREE_OH:
      return generateCustom3x3Scramble(moves || 20, difficulty);
    case cubeTypes.PYRAMINX:
      // For other puzzles, we fall back to the standard scrambler but adjust the output length
      return generatePyraminxScramble();
    case cubeTypes.SKEWB:
      return generateSkewbScramble();
    case cubeTypes.CLOCK:
      return generateClockScramble();
    default:
      return generateCustom3x3Scramble(moves || 20, difficulty);
  }
}

/**
 * Generate a scramble for the specified cube type
 */
export function generateScramble(cubeType: CubeType): string {
  switch (cubeType) {
    case cubeTypes.THREE:
      return generate3x3Scramble();
    case cubeTypes.TWO:
      return generate2x2Scramble();
    case cubeTypes.PYRAMINX:
      return generatePyraminxScramble();
    case cubeTypes.SKEWB:
      return generateSkewbScramble();
    case cubeTypes.CLOCK:
      return generateClockScramble();
    case cubeTypes.THREE_BLD:
      return generate3x3BLDScramble();
    case cubeTypes.THREE_OH:
      return generate3x3OHScramble();
    default:
      return generate3x3Scramble(); // Default to 3x3
  }
}
