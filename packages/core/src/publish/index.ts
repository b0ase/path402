/**
 * $402 Sovereign Publisher
 *
 * Re-exports for @path402/core/publish
 */

export { publishProject, initManifest } from './publisher.js';
export type { PublishOptions, PublishResult, FileEntry } from './publisher.js';

export {
    ProjectManifestSchema,
    parseManifest,
    createManifestFromFlags,
    generateManifestTemplate,
} from './manifest.js';
export type { ProjectManifest } from './manifest.js';
