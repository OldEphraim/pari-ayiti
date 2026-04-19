// Test-only shim. The real `uuid` package ships pure ESM and Jest's default
// transformer ignores node_modules, so letting the real module load would
// throw SyntaxError on the first `export {...} from` line. Tests don't need
// real randomness — a monotonic counter suffices for any code path that
// falls through to uuid().

let counter = 0;

export function v4(): string {
  counter += 1;
  return `test-uuid-${counter.toString().padStart(12, '0')}`;
}
