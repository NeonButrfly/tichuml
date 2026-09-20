# Linux SSH access

Tracking issue: [#132](https://github.com/NeonButrfly/tichuml/issues/132)

The local Codex SSH configuration uses the dedicated Ed25519 key
`codex_kay_shared_ed25519` with fingerprint
`SHA256:x94RO/U/O+Wr8V+gmcuOogWZYIlE1K3oJHPyQUz18ck` for the configured
`kay` Linux hosts. The password used for bootstrap access is not stored in
this repository or in the SSH configuration.

## Validation state on 2026-09-20

| Host | Address | Key-based access | State |
| --- | --- | --- | --- |
| `tichuml` | `192.168.50.36` | Passing | `hostname` and `whoami` succeed with `BatchMode=yes`. |
| `tichuml1` | `192.168.50.196` | Blocked | Password authentication succeeds, but the SSH server times out while opening the session channel, so the key cannot yet be installed. |
| `kayraspi` | `192.168.50.235` | Blocked | Host is not responding to ping or SSH. |
| `kayraspi2` | `192.168.50.86` | Passing | `hostname` and `whoami` succeed with `BatchMode=yes`. |

After a blocked host is reachable and can open a normal SSH session, install
the existing public key idempotently and verify with:

```text
ssh -o BatchMode=yes <host> "hostname; whoami"
```

Do not record or commit the bootstrap password.
