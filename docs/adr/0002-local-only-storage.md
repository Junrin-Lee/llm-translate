# All user data stored only in `storage.local`, not `storage.sync`

**English** · [简体中文](./0002-local-only-storage.zh-CN.md)

All data — API Key, Provider configuration, site list, Prompt overrides, etc. — is stored only in the on-device `storage.local`; cross-device migration relies on JSON import/export (exports exclude the Key by default). We give up the multi-device convenience of `storage.sync` in exchange for the cleanest privacy narrative: the privacy policy can state that "all data never leaves your machine, and the only network request goes to the API endpoint you configured yourself" — `storage.sync` would send data in plaintext into Google's account-sync pipeline, a liability for a BYOK extension whose selling point is privacy.

## Consequences

- Switching devices / reinstalling requires manually importing the configuration or re-entering the Key, so the settings page needs to make import/export prominent.
- Introducing sync in the future could only sync non-sensitive configuration and would be a change that breaks this decision, requiring the privacy policy to be re-evaluated.
