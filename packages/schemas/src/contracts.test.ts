import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, test } from 'vitest';

const ajv = new Ajv2020({ strict: true });
ajv.addFormat('int32', {
  type: 'number',
  validate: (value: number) =>
    Number.isInteger(value) && value >= -2147483648 && value <= 2147483647,
});
const manifest = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL('../json/ProjectManifest.json', import.meta.url),
      'utf8',
    ),
  ),
);
const events = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL('../json/EventEnvelope.json', import.meta.url),
      'utf8',
    ),
  ),
);
describe('Rust schemas consumed in TypeScript', () => {
  test('manifest accepts only its minimal versioned contract', () => {
    expect(manifest({ schema_version: 1, project_id: 'prj_fixture' })).toBe(
      true,
    );
    expect(manifest({ schema_version: 2, project_id: 'prj_fixture' })).toBe(
      false,
    );
    expect(
      manifest({
        schema_version: 1,
        project_id: 'prj_fixture',
        token: 'synthetic-fixture',
      }),
    ).toBe(false);
  });
  test('events preserve a failed test and reject untyped payloads', () => {
    const envelope = {
      schema_version: 1,
      id: 'fixture',
      idempotency_key: 'fixture:test',
      project_id: 'prj_fixture',
      session_id: 'ses_fixture',
      agent: { harness: 'codex', version: 'fixture' },
      event: {
        type: 'test.run',
        payload: { command: 'cargo test', exit_code: 1, summary: '1 failed' },
      },
      evidence: [],
      base_rev: null,
      created_at: '2026-10-23T00:00:00Z',
    };
    expect(events(envelope)).toBe(true);
    expect(
      events({
        ...envelope,
        event: {
          type: 'test.run',
          payload: { command: 'cargo test', exit_code: 'passed' },
        },
      }),
    ).toBe(false);
  });
});
