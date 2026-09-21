/**
 * Package version. Replaced with the real version at bundle time; the fallback
 * applies when running from source.
 */

declare const __FASTPATH_VERSION__: string | undefined;

export const VERSION: string =
  typeof __FASTPATH_VERSION__ === 'string' ? __FASTPATH_VERSION__ : '0.0.0-dev';
