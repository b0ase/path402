/**
 * Narrative Path Engine — Deterministic content generation pipeline
 *
 * Pipeline: Series → Characters → Story → Script → Content
 *
 * This module provides the generation logic without LLM dependency.
 * For AI-enhanced generation, use the prompt templates from prompts.ts
 * with your preferred LLM provider.
 */

import type {
  Series,
  Character,
  Story,
  Script,
  ScriptSegment,
  GeneratedContent,
  ContentType,
  GenerateSeriesRequest,
  GenerateCharacterRequest,
  GenerateStoryRequest,
  GenerateScriptRequest,
} from './types';

// Character generation pools
const CHARACTER_POOLS = {
  hero: {
    names: ['Nova', 'Shadow', 'Echo', 'Cyber', 'Zara', 'Phoenix', 'Blade', 'Storm', 'Aria', 'Flux'],
    powers: ['Super Strength', 'Energy Projection', 'Teleportation', 'Mind Control', 'Healing', 'Flight', 'Time Shift', 'Phase Walk'],
    personalities: ['Brave', 'Determined', 'Compassionate', 'Strategic', 'Loyal', 'Optimistic', 'Resourceful', 'Stoic'],
  },
  villain: {
    names: ['Void', 'Chaos', 'Venom', 'Shadow Lord', 'Dark One', 'Corruptor', 'Destroyer', 'Nightmare'],
    powers: ['Dark Energy', 'Reality Manipulation', 'Mind Control', 'Shadow Manipulation', 'Corruption', 'Fear Projection'],
    personalities: ['Ruthless', 'Cunning', 'Manipulative', 'Power-hungry', 'Vengeful', 'Chaotic'],
  },
  neutral: {
    names: ['Sage', 'Watcher', 'Oracle', 'Drifter', 'Cipher', 'Nomad'],
    powers: ['Foresight', 'Knowledge', 'Neutrality Field', 'Information Weaving', 'Balance'],
    personalities: ['Wise', 'Enigmatic', 'Detached', 'Observant', 'Balanced'],
  },
  narrator: {
    names: ['Chronicle', 'Scribe', 'Voice', 'Memory'],
    powers: ['Omniscience', 'Story Weaving'],
    personalities: ['Reflective', 'Authoritative', 'Poetic'],
  },
};

const STORY_TEMPLATES = [
  'In a world where {setting}, {hero} must face their greatest challenge yet when {villain} threatens everything. As they struggle with {conflict}, they discover that the true battle lies within.',
  'When {villain} unleashes chaos, {hero} must overcome their weaknesses. But as the conflict escalates, they realize that {theme} is more complex than they imagined.',
  'The peaceful {setting} is shattered when {villain} reveals plans for domination. {hero}, armed with {powers}, must navigate between personal conflicts and duty.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSeries(request: GenerateSeriesRequest): Series {
  return {
    id: uid('series'),
    name: request.name,
    genre: request.genre || 'action',
    theme: request.theme || 'heroic',
    description: request.description || `A ${request.genre || 'action'} series with ${request.theme || 'heroic'} themes.`,
    artStyle: request.artStyle || 'modern',
    targetAudience: request.targetAudience || 'all-ages',
    setting: request.setting || 'Modern Day',
    contentType: request.contentType || 'comic',
    createdAt: new Date().toISOString(),
    status: 'complete',
    metadata: {
      totalIssues: Math.floor(Math.random() * 12) + 1,
      estimatedSegments: Math.floor(Math.random() * 200) + 50,
    },
  };
}

export function generateCharacter(request: GenerateCharacterRequest): Character {
  const pool = CHARACTER_POOLS[request.type] || CHARACTER_POOLS.hero;
  const name = pick(pool.names);
  const power = pick(pool.powers);
  const personality = pick(pool.personalities);

  return {
    id: uid('char'),
    name,
    type: request.type,
    seriesId: request.seriesId,
    powers: power,
    personality,
    description: `A ${request.type} with ${power.toLowerCase()} abilities and a ${personality.toLowerCase()} personality.`,
    appearance: `A striking figure with distinctive features reflecting their ${request.type} nature.`,
    backstory: `Born into a world of adventure, discovered their powers and chose the path of a ${request.type}.`,
    createdAt: new Date().toISOString(),
  };
}

export function generateStory(request: GenerateStoryRequest, characters: Character[] = []): Story {
  const hero = characters.find(c => c.type === 'hero');
  const villain = characters.find(c => c.type === 'villain');

  let content = pick(STORY_TEMPLATES);
  content = content
    .replace('{setting}', request.setting || 'the modern world')
    .replace('{hero}', hero?.name || 'the hero')
    .replace('{villain}', villain?.name || 'dark forces')
    .replace('{conflict}', request.conflict || 'good vs evil')
    .replace('{theme}', request.theme || 'justice')
    .replace('{powers}', hero?.powers || 'extraordinary abilities');

  return {
    id: uid('story'),
    title: request.title || 'Untitled Story',
    seriesId: request.seriesId,
    genre: request.genre || 'Fantasy',
    setting: request.setting || 'Modern Day',
    tone: request.tone || 'Adventure',
    conflict: request.conflict || 'Hero vs Villain',
    theme: request.theme || 'Good vs Evil',
    content,
    characters: characters.map(c => c.id),
    createdAt: new Date().toISOString(),
    status: 'complete',
  };
}

export function generateScript(request: GenerateScriptRequest, story: Story): Script {
  const totalSegments = request.segments || 24;
  const perGroup = request.segmentsPerGroup || 6;
  const segments: ScriptSegment[] = [];

  for (let i = 0; i < totalSegments; i++) {
    segments.push({
      id: i + 1,
      group: Math.floor(i / perGroup) + 1,
      position: (i % perGroup) + 1,
      description: `Segment ${i + 1}: ${i < perGroup ? 'Setup' : i < totalSegments - perGroup ? 'Rising action' : 'Climax/Resolution'}`,
      dialogue: '',
      narration: '',
      action: '',
      direction: '',
    });
  }

  return {
    id: uid('script'),
    title: `${story.title} — Script`,
    storyId: story.id,
    contentType: request.contentType,
    segments,
    createdAt: new Date().toISOString(),
    status: 'complete',
  };
}

/**
 * Full pipeline: generate all components from a series request
 */
export function generateFullContent(
  seriesRequest: GenerateSeriesRequest,
  storyTitle?: string,
): GeneratedContent {
  const series = generateSeries(seriesRequest);

  const hero = generateCharacter({ type: 'hero', seriesId: series.id });
  const villain = generateCharacter({ type: 'villain', seriesId: series.id });
  const characters = [hero, villain];

  const story = generateStory(
    {
      title: storyTitle || `${series.name} — One Shot`,
      seriesId: series.id,
      genre: series.genre,
      setting: series.setting,
      theme: series.theme,
    },
    characters,
  );

  const script = generateScript(
    {
      storyId: story.id,
      storyTitle: story.title,
      contentType: series.contentType,
      segments: 24,
      segmentsPerGroup: 6,
    },
    story,
  );

  return {
    id: uid('content'),
    title: `${series.name} — One Shot`,
    seriesName: series.name,
    contentType: series.contentType,
    components: { series, characters, story, script },
    createdAt: new Date().toISOString(),
  };
}
