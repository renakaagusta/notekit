import data from '@notekit/tokens/tokens.json';

export interface DesignToken {
  name: string;
  path: string[];
  category: string;
  group: string | null;
  type: string;
  value: string;
  raw: unknown;
  description: string;
}

export const tokens = (data as { tokens: DesignToken[] }).tokens;

export function byCategory(category: string): DesignToken[] {
  return tokens.filter((token) => token.category === category);
}

export function byGroup(category: string, group: string): DesignToken[] {
  return tokens.filter((token) => token.category === category && token.group === group);
}

export function leaf(token: DesignToken): string {
  return token.path[token.path.length - 1];
}

export function neutralScale(mode: 'dark' | 'light'): DesignToken[] {
  return tokens
    .filter(
      (token) =>
        token.path[0] === 'color' &&
        token.path[1] === 'scale' &&
        token.path[2] === 'neutral' &&
        token.path[3] === mode,
    )
    .sort((a, b) => Number(a.path[4]) - Number(b.path[4]));
}
