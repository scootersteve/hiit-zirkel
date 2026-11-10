// Body graphic: the figure from the front and from the back, regions filled by level
// (see core/muscles.js). Colours come from the --muscle-* tokens, so light, dark and themes
// follow without touching this file. Graphic: react-native-body-highlighter (MIT), see
// js/data/body.js and THIRD-PARTY-NOTICES.md.

import { BODY } from '../data/body.js';
import { MUSCLES } from '../data/muscles.js';
import { esc } from './dom.js';

function side(name, levels) {
  const { viewBox, outline, parts } = BODY[name];
  const shapes = parts
    .map(([slug, d]) => `<path class="bp" data-l="${slug in MUSCLES ? levels[slug] || 0 : 0}" d="${d}"/>`)
    .join('');
  return `<svg class="body-side" viewBox="${viewBox}" aria-hidden="true">${shapes}<path class="body-line" d="${outline}"/></svg>`;
}

/**
 * `levels`: { region: 1 | 2 | 3 }. `label` describes the picture for screen readers (the same
 * information always stands next to it as text).
 */
export function bodyFigure(levels, label) {
  return `<div class="body-fig" role="img" aria-label="${esc(label)}">${side('front', levels)}${side('back', levels)}</div>`;
}

/** "Brust, Trizeps" for a list of region names. */
export const muscleNames = (regions) => regions.map((m) => MUSCLES[m] || m).join(', ');
