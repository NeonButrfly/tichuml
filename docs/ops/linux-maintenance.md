# Linux maintenance record

Issue: [#133](https://github.com/NeonButrfly/tichuml/issues/133)

Maintenance was performed on 2026-09-20. Each reachable private host was updated with `apt-get update` followed by `full-upgrade`, rebooted, and checked over SSH afterward. The public `tnr-0` host was not changed because the configured SSH credentials were rejected.

| Host | Result | Post-reboot kernel | Post-reboot checks |
| --- | --- | --- | --- |
| `tichuml` (`192.168.50.36`) | Updated and rebooted | `6.8.0-139-generic` | SSH active, systemd running, no reboot-required flag |
| `tichuml1` (`192.168.50.196`) | Updated and rebooted | `6.17.0-41-generic` | SSH active, systemd running, `calsync-db-1` and `tichu-postgres` healthy, port 5433 listening, no reboot-required flag |
| `kayraspi` (`192.168.50.232`) | Updated and rebooted | `6.18.50+rpt-rpi-v8` | SSH active, Docker active, no reboot-required flag; systemd remains in startup because `wayvnc.service` repeatedly fails to bind its socket |
| `kayraspi2` (`192.168.50.86`) | Updated and rebooted | `6.18.50+rpt-rpi-2712` | SSH active, Docker active, systemd running, no reboot-required flag |
| `tnr-0` (`216.81.200.239:32030`) | Not reached | Unknown | SSH authentication rejected; no update or reboot attempted |

Notes:

- `tichuml` installed and booted the `6.8.0-139-generic` kernel. One AppArmor post-install warning was emitted during the upgrade; the host booted cleanly and systemd reported running afterward.
- `tichuml1` is running Ubuntu 25.10, which reported as unsupported during the update. Plan an OS release migration separately rather than combining it with routine maintenance.
- Both Raspberry Pi hosts installed the Raspberry Pi `6.18.50` kernel packages. `kayraspi` also reported a `wayvnc` bind-address failure during package configuration and after reboot; this remains an unresolved service issue outside the requested update/reboot scope.
- The cloud-vault mount warnings observed during early boot cleared on `tichuml1`; its mount and dependent database containers were healthy during the final check.
