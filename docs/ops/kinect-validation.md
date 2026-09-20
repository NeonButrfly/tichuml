# Kinect v2 host validation

Tracking issue: [#131](https://github.com/NeonButrfly/tichuml/issues/131)

## Current state

On 2026-09-19, `tichuml` (`192.168.50.36`) was reachable as `kay` and reported Ubuntu 24.04.3. `lsusb` did not show the Kinect v2 device (`045e:02c4`), and no `libfreenect2` package, library, or Kinect udev rule was installed. The account also did not have passwordless `sudo`, so the driver could not be installed safely.

`tichuml1` (`192.168.50.196`) responded to ping, but the configured SSH keys were rejected. Its USB state and driver state remain unverified.

## Required validation

After authorized SSH and administrative access are available:

1. Confirm `lsusb` shows Microsoft `Xbox NUI Sensor` with VID:PID `045e:02c4`.
2. Confirm the device is on a stable USB 3 path with `lsusb -t`.
3. Install or build OpenKinect `libfreenect2` and install `90-kinect2.rules`.
4. Replug the sensor and run `Protonect` to confirm the device opens and frames are received.
5. Record USB diagnostics and `dmesg` output if enumeration or frame capture fails.

Package readiness does not establish physical USB connectivity or successful frame capture.
