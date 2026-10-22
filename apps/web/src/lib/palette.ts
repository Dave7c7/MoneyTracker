/**
 * The colours of the category charts.
 *
 * A group keeps its colour: the colour belongs to the category, not to its
 * place in the chart. Changing the month or filtering therefore never
 * repaints a slice.
 *
 * The children of a group use the hue of their group with a decreasing
 * opacity, so a group and what is inside it are clearly the same family.
 */

/** The colour of the folded slice. It is not a category. */
export const OTHER_COLOR = '#898781';

/**
 * The colours a group that has no colour of its own falls back to.
 *
 * The same palette the default categories use, so a group the user made
 * still looks like it belongs.
 */
const FALLBACK_PALETTE = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#0f9b8e',
  '#7c5cff',
  '#8b5a2b',
];

/** The opacity of the children of a group, from the first to the last. */
const CHILD_OPACITIES = [1, 0.78, 0.56, 0.4, 0.28, 0.2];

/**
 * The colour of a group.
 *
 * @example
 * colorForGroup('abc', { abc: '#2a78d6' }); // '#2a78d6'
 */
export function colorForGroup(groupId: string, colors: Readonly<Record<string, string>>): string {
  const known = colors[groupId];
  if (known) return known;

  let hash = 0;
  for (let index = 0; index < groupId.length; index += 1) {
    hash = (hash * 31 + groupId.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length] ?? FALLBACK_PALETTE[0]!;
}

/**
 * The colour of the child of a group: the hue of the group, a little lighter.
 *
 * @example
 * withOpacity('#2a78d6', 0.78); // 'rgba(42, 120, 214, 0.78)'
 */
export function withOpacity(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const number = Number.parseInt(value, 16);
  if (Number.isNaN(number)) return hex;
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * The opacity of the child at the given place.
 *
 * @example
 * childOpacity(0); // 1
 * childOpacity(1); // 0.78
 */
export function childOpacity(index: number): number {
  return CHILD_OPACITIES[Math.min(index, CHILD_OPACITIES.length - 1)] ?? 1;
}
