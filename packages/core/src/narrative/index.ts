/**
 * Narrative Path Engine
 *
 * Content generation pipeline extracted from One-Shot Comics.
 * Supports multiple content types: comic, video, writer, art.
 *
 * Usage:
 *   import { generateFullContent } from '@path402/core/narrative';
 *
 *   const content = generateFullContent({
 *     name: 'Zero Dice',
 *     genre: 'sci-fi',
 *     theme: 'probability',
 *     contentType: 'comic',
 *   });
 */

export type {
  ContentType,
  GenerationStatus,
  Series,
  Character,
  Story,
  Script,
  ScriptSegment,
  GeneratedContent,
  GenerateSeriesRequest,
  GenerateCharacterRequest,
  GenerateStoryRequest,
  GenerateScriptRequest,
} from './types';

export {
  generateSeries,
  generateCharacter,
  generateStory,
  generateScript,
  generateFullContent,
} from './engine';

export {
  seriesPrompt,
  characterPrompt,
  storyPrompt,
  scriptPrompt,
} from './prompts';
