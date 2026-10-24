/**
 * Environment validation.
 *
 * Design rules:
 * - Values are never logged, thrown, or rendered. Only the *names* of missing
 *   or malformed variables are reported, so a secret can't leak through an
 *   error message or a screenshot.
 * - Validation runs once at module load; callers get a typed result instead of
 *   parsing `import.meta.env` ad hoc.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export type EnvIssue =
  | 'missing-url'
  | 'invalid-url'
  | 'missing-anon-key'
  | 'short-anon-key'

export type EnvResult =
  | { ok: true; config: SupabaseConfig }
  | { ok: false; issues: EnvIssue[] }

/** Minimal shape of Vite's env object; kept loose so tests can pass plain objects. */
export interface EnvSource {
  [key: string]: string | undefined
}

const ISSUE_MESSAGES: Record<EnvIssue, string> = {
  'missing-url': 'VITE_SUPABASE_URL is not set.',
  'invalid-url': 'VITE_SUPABASE_URL is not a valid URL.',
  'missing-anon-key': 'VITE_SUPABASE_ANON_KEY is not set.',
  'short-anon-key': 'VITE_SUPABASE_ANON_KEY looks too short to be a real key.',
}

function isPlaceholder(value: string): boolean {
  return /YOUR-PROJECT-REF|YOUR-ANON/i.test(value)
}

export function readSupabaseConfig(env: EnvSource = import.meta.env): EnvResult {
  const issues: EnvIssue[] = []

  const rawUrl = env.VITE_SUPABASE_URL?.trim()
  let url = ''

  if (!rawUrl || isPlaceholder(rawUrl)) {
    issues.push('missing-url')
  } else {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        issues.push('invalid-url')
      } else {
        url = rawUrl.replace(/\/+$/, '')
      }
    } catch {
      issues.push('invalid-url')
    }
  }

  const rawKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  let anonKey = ''

  if (!rawKey || isPlaceholder(rawKey)) {
    issues.push('missing-anon-key')
  } else if (rawKey.length < 20) {
    issues.push('short-anon-key')
  } else {
    anonKey = rawKey
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, config: { url, anonKey } }
}

/** Human-readable, non-sensitive descriptions of configuration problems. */
export function describeIssues(issues: EnvIssue[]): string[] {
  return issues.map((issue) => ISSUE_MESSAGES[issue])
}
