# Provider Profile "name" is an optional display label, not an identity key

**English** · [简体中文](./0004-provider-profile-name-optional.zh-CN.md)

Provider Profiles are referenced by their `id` (a generated UUID) everywhere it matters — `defaults.global`, per-feature overrides, and `resolveProfile()` all match on `id`, never on `name`. The `name` field is purely a user-facing display label: the options UI lets you save a profile with an empty name, and translation works fine without it. Therefore the import validation in `src/storage/import-export.ts` no longer requires `name` to be a non-empty string; only `id`, `baseUrl`, and `model` stay required. This fixes a round-trip asymmetry where a profile with a blank name could be created, saved, and exported, but failed to import with `Provider field "name" must be a non-empty string`.

## Consequences

- Import/export is symmetric for `name`: anything the app can export it can import back.
- `id` remains the single binding key and must stay non-empty on import — a profile with no id cannot be referenced by defaults or feature overrides.
- `baseUrl` and `model` are still required on import: a profile missing them cannot perform a translation. A blank name is harmless; a blank endpoint or model is not. Fully loss-less round-trips for half-configured profiles would be a separate decision.
