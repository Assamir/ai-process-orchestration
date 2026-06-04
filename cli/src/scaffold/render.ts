/**
 * Replace {{PLACEHOLDER}} tokens with values from `vars`.
 *
 * Unknown placeholders are left intact on purpose: phase 1 fills what static
 * analysis knows, and phase 2 (the Claude Code skill) resolves the rest.
 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key]! : match,
  );
}
