/**
 * The script-tag entry: everything in `undo-toast` plus `mountUndoToast`, built as one file that
 * defines a global `UndoToast` (`dist/undo-toast.global.js`), for a page with no module loader.
 */
export * from '../index.js';
export { mountUndoToast } from './index.js';
export type { MountUndoToastOptions } from './index.js';
