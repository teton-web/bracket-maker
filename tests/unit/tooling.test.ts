import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

// WCP bm-1: package.json pins Next to a release that accepts extensionless Google font URLs (BM-1 turbopack font build)
// WCP bm-2: types/routes.d.ts is not a stale checked-in route map (BM-2 typecheck)

function parseVersion(spec: string): [number, number, number] {
  const [major, minor, patch] = spec.replace(/^[\^~]/, '').split('.').map(Number);
  return [major, minor, patch];
}

describe('tooling', () => {
  test('typecheck script and Next font fix are in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toContain('tsc --noEmit');
    expect(pkg.scripts.typecheck).toContain('next typegen');
    const next = parseVersion(pkg.dependencies.next);
    const eslintNext = parseVersion(pkg.devDependencies['eslint-config-next']);
    expect(next[0]).toBe(16);
    expect(next[1] > 4 || (next[1] === 4 && next[2] >= 3)).toBe(true);
    expect(eslintNext).toEqual(next);
  });

  test('generated Next route types are not checked in', () => {
    expect(existsSync('types/routes.d.ts')).toBe(false);
    expect(existsSync('types/validator.ts')).toBe(false);
    expect(existsSync('types/cache-life.d.ts')).toBe(false);
    expect(existsSync('types/tournament.ts')).toBe(true);
  });

  test('LICENSE names the copyright holder', () => {
    const text = readFileSync('LICENSE', 'utf8');
    expect(text).toContain('Permission is hereby granted');
    expect(text).toContain('Copyright (c) 2026 David Solheim / Teton Web Ventures');
  });

  test('AGENTS.md points at the prose queue and Teton', () => {
    const text = readFileSync('AGENTS.md', 'utf8');
    expect(text).toContain('.wcp/issues/');
    expect(text).toContain('Teton Web MCP');
    expect(text).toContain('no `wcp` binary');
  });

  test('bun test ignores Playwright specs', () => {
    const text = readFileSync('bunfig.toml', 'utf8');
    expect(text).toContain('tests/e2e/**');
  });
});
