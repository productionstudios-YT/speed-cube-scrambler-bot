import { CubeType, cubeTypes, daySchedule } from '@shared/schema';
import { generateScramble, generateCustomScramble } from '@shared/scrambleGenerators';

/**
 * Class to manage daily scrambles based on the schedule
 */
export class ScrambleManager {
  /**
   * Get the cube type for a specific day
   * @param date The date to get the cube type for
   * @returns The cube type for the given day
   */
  getCubeTypeForDay(date: Date = new Date()): CubeType {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
    const day = days[date.getDay()];
    return daySchedule[day];
  }

  /**
   * Generate a scramble for the current day
   * @returns Object containing the day, cube type, and scramble
   */
  generateDailyScramble(date: Date = new Date()) {
    const cubeType = this.getCubeTypeForDay(date);
    const scramble = generateScramble(cubeType);
    
    // Get day name in proper case (e.g., "Monday")
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    
    return {
      day: dayName,
      cubeType,
      scramble
    };
  }
  
  /**
   * Convert string to valid CubeType
   * @param cubeTypeStr String representation of cube type
   * @returns Valid CubeType or default to 3x3
   */
  stringToCubeType(cubeTypeStr: string): CubeType {
    // Convert to known cube type if possible
    const knownTypes: Record<string, CubeType> = {
      'skewb': cubeTypes.SKEWB,
      'skb': cubeTypes.SKEWB,
      '3x3 bld': cubeTypes.THREE_BLD,
      '3bld': cubeTypes.THREE_BLD,
      '2x2': cubeTypes.TWO,
      '2': cubeTypes.TWO,
      '3x3': cubeTypes.THREE,
      '3': cubeTypes.THREE,
      'pyraminx': cubeTypes.PYRAMINX,
      'pyra': cubeTypes.PYRAMINX,
      '3x3 oh': cubeTypes.THREE_OH,
      '3oh': cubeTypes.THREE_OH,
      'clock': cubeTypes.CLOCK,
      'clk': cubeTypes.CLOCK
    };
    
    const normalizedInput = cubeTypeStr.toLowerCase().trim();
    return knownTypes[normalizedInput] || cubeTypes.THREE; // Default to 3x3 if not found
  }

  /**
   * Generate a scramble for a specific cube type
   * @param cubeType The cube type to generate a scramble for
   * @returns Object containing the cube type and scramble
   */
  generateScrambleForType(cubeType: CubeType | string) {
    // If it's a string, convert it to a proper CubeType
    const actualCubeType = typeof cubeType === 'string' ? this.stringToCubeType(cubeType) : cubeType;
    const scramble = generateScramble(actualCubeType);
    
    return {
      cubeType: actualCubeType,
      scramble
    };
  }
  
  /**
   * Generate a custom scramble with specific parameters
   * @param cubeType The cube type to generate a scramble for
   * @param moves Optional number of moves
   * @param difficulty Optional difficulty level (easy, medium, hard)
   * @returns Object containing the cube type and custom scramble
   */
  generateCustomScrambleForType(cubeType: CubeType | string, moves?: number, difficulty: string = 'medium') {
    // If it's a string, convert it to a proper CubeType
    const actualCubeType = typeof cubeType === 'string' ? this.stringToCubeType(cubeType) : cubeType;
    const scramble = generateCustomScramble(actualCubeType, moves, difficulty);
    
    return {
      cubeType: actualCubeType,
      scramble,
      customParameters: {
        moves: moves || 'default',
        difficulty
      }
    };
  }

  /**
   * Generate the thread title for a daily challenge
   * @param date The date for the challenge
   * @returns The formatted thread title
   */
  generateThreadTitle(date: Date = new Date()): string {
    // Just the event name alone
    const cubeType = this.getCubeTypeForDay(date);
    return cubeType;
  }

  /**
   * Generate the thread content with scramble details
   * @param date The date for the challenge
   * @returns Formatted message content for the thread
   */
  generateThreadContent(date: Date = new Date()): string {
    const { day, cubeType, scramble } = this.generateDailyScramble(date);
    
    return `# Today's Daily Scramble!
||@daily scramble ping||

\`\`\`
${scramble}
\`\`\`

Good luck! 🍀`;
  }
}

export const scrambleManager = new ScrambleManager();
