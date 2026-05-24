// Read the E2E_PAT environment variable and expose it as `output.pat` so
// downstream Maestro steps can reference it via `${output.pat}`.
//
// Avoids Maestro 2.x's inconsistent `${VAR}` substitution inside
// `inputText` commands by pulling the value through `runScript` instead.
//
// Maestro injects env vars from `--env` into the JS global scope by name,
// so `E2E_PAT` is accessible directly.
output.pat = typeof E2E_PAT !== 'undefined' ? E2E_PAT : '';
if (!output.pat) {
  throw new Error('E2E_PAT not provided. Pass via `maestro test -e E2E_PAT=nkp_…`');
}
