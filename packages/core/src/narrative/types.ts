/**
 * Narrative Path Engine — Content generation pipeline
 *
 * Extracted from One-Shot Comics (oneshotcomics-bsv).
 * Generalized for any content type: comic, video, writer, art.
 */

export type ContentType = 'comic' | 'video' | 'writer' | 'art';
export type GenerationStatus = 'draft' | 'generating' | 'complete' | 'error';

export interface Series {
  id: string;
  name: string;
  genre: string;
  theme: string;
  description: string;
  artStyle?: string;
  targetAudience?: string;
  setting?: string;
  contentType: ContentType;
  createdAt: string;
  status: GenerationStatus;
  metadata?: Record<string, unknown>;
}

export interface Character {
  id: string;
  name: string;
  type: 'hero' | 'villain' | 'neutral' | 'narrator';
  seriesId: string;
  powers?: string;
  personality?: string;
  description: string;
  appearance?: string;
  backstory?: string;
  voiceStyle?: string;
  createdAt: string;
}

export interface Story {
  id: string;
  title: string;
  seriesId: string;
  genre: string;
  setting: string;
  tone: string;
  conflict: string;
  theme: string;
  content: string;
  characters: string[];
  createdAt: string;
  status: GenerationStatus;
}

export interface Script {
  id: string;
  title: string;
  storyId: string;
  contentType: ContentType;
  segments: ScriptSegment[];
  createdAt: string;
  status: GenerationStatus;
}

export interface ScriptSegment {
  id: number;
  /** For comics: page/panel. For video: scene/shot. For writer: chapter/section. */
  group: number;
  position: number;
  description: string;
  dialogue?: string;
  narration?: string;
  action?: string;
  direction?: string;
}

export interface GeneratedContent {
  id: string;
  title: string;
  subtitle?: string;
  seriesName: string;
  contentType: ContentType;
  components: {
    series: Series;
    characters: Character[];
    story: Story;
    script: Script;
  };
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// Generation request types
export interface GenerateSeriesRequest {
  name: string;
  genre?: string;
  theme?: string;
  description?: string;
  artStyle?: string;
  targetAudience?: string;
  setting?: string;
  contentType?: ContentType;
}

export interface GenerateCharacterRequest {
  type: 'hero' | 'villain' | 'neutral' | 'narrator';
  seriesId: string;
  seriesName?: string;
}

export interface GenerateStoryRequest {
  title?: string;
  seriesId: string;
  genre?: string;
  setting?: string;
  tone?: string;
  conflict?: string;
  theme?: string;
  characters?: string[];
}

export interface GenerateScriptRequest {
  storyId: string;
  storyTitle?: string;
  contentType: ContentType;
  segments?: number;
  segmentsPerGroup?: number;
}
