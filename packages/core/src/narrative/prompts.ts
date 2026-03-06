/**
 * Content-type specific prompt templates for narrative generation.
 * These can be used with any LLM to generate structured content.
 */

import type { ContentType, Series, Character, Story } from './types';

export function seriesPrompt(contentType: ContentType, name: string, genre: string, theme: string): string {
  const typeContext: Record<ContentType, string> = {
    comic: `Create a comic book series called "${name}" in the ${genre} genre with ${theme} themes. Include panel pacing, visual storytelling notes, and art direction.`,
    video: `Create a video series called "${name}" in the ${genre} genre with ${theme} themes. Include scene pacing, shot composition notes, and visual style direction.`,
    writer: `Create a written series called "${name}" in the ${genre} genre with ${theme} themes. Include chapter structure, prose style notes, and narrative voice direction.`,
    art: `Create an art series called "${name}" in the ${genre} genre with ${theme} themes. Include image sequence planning, style consistency notes, and composition direction.`,
  };

  return typeContext[contentType];
}

export function characterPrompt(contentType: ContentType, type: string, series: Series): string {
  const typeContext: Record<ContentType, string> = {
    comic: `Create a ${type} character for the comic series "${series.name}". Include visual description suitable for illustration, distinctive features, and costume/appearance notes.`,
    video: `Create a ${type} character for the video series "${series.name}". Include casting notes, mannerisms, speech patterns, and on-screen presence description.`,
    writer: `Create a ${type} character for the written series "${series.name}". Include internal monologue style, dialogue patterns, and narrative perspective notes.`,
    art: `Create a ${type} subject for the art series "${series.name}". Include visual motifs, color palette associations, and compositional role.`,
  };

  return typeContext[contentType];
}

export function storyPrompt(contentType: ContentType, series: Series, characters: Character[]): string {
  const charNames = characters.map(c => c.name).join(', ');

  const typeContext: Record<ContentType, string> = {
    comic: `Write a story outline for the comic "${series.name}" featuring ${charNames}. Structure as: setup (2 pages), conflict (4 pages), climax (2 pages), resolution (2 pages). Note panel breakdowns per section.`,
    video: `Write a story outline for the video "${series.name}" featuring ${charNames}. Structure as: cold open (30s), act 1 (3min), act 2 (5min), climax (2min), resolution (1min). Note shot types per section.`,
    writer: `Write a story outline for "${series.name}" featuring ${charNames}. Structure as: prologue, 3-5 chapters with rising action, climax chapter, epilogue. Note POV shifts and pacing.`,
    art: `Write an image sequence outline for "${series.name}" featuring ${charNames}. Structure as: establishing shot, 5-8 progression images, climax image, closing composition. Note style evolution.`,
  };

  return typeContext[contentType];
}

export function scriptPrompt(contentType: ContentType, story: Story, segments: number, segmentsPerGroup: number): string {
  const groupLabel: Record<ContentType, [string, string]> = {
    comic: ['page', 'panel'],
    video: ['scene', 'shot'],
    writer: ['chapter', 'section'],
    art: ['sequence', 'image'],
  };

  const [group, segment] = groupLabel[contentType];
  const totalGroups = Math.ceil(segments / segmentsPerGroup);

  return `Generate a detailed ${contentType} script for "${story.title}". Create ${totalGroups} ${group}s with ${segmentsPerGroup} ${segment}s each (${segments} total ${segment}s). For each ${segment}, provide: description, dialogue (if any), narration, and ${contentType === 'comic' ? 'panel composition' : contentType === 'video' ? 'camera direction' : contentType === 'art' ? 'composition notes' : 'prose style'}.`;
}
