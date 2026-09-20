# Kinect v2 host validation

Tracking issue: [#131](https://github.com/NeonButrfly/tichuml/issues/131)

## Current state

On 2026-09-19, `tichuml` (`192.168.50.36`) was reachable as `kay` and reported Ubuntu 24.04.3. The required build packages were installed, OpenKinect `libfreenect2` was built successfully under `/home/kay/src/libfreenect2`, and the user-prefix installation is `/home/kay/freenect2`. The root-owned `/etc/udev/rules.d/90-kinect2.rules` was installed and udev was reloaded.

`lsusb` still did not show the Kinect v2 device (`045e:02c4`). `Protonect` started successfully but reported `found 0 devices` and exited with `no device connected!`. The driver stack is ready, but physical USB/frame capture is not validated.

`tichuml1` (`192.168.50.196`) responds to ping, but the configured keys and the supplied password did not produce a usable SSH session. Its USB state and driver state remain unverified.

## Required validation

After authorized SSH and administrative access are available:

1. Confirm `lsusb` shows Microsoft `Xbox NUI Sensor` with VID:PID `045e:02c4`.
2. Confirm the device is on a stable USB 3 path with `lsusb -t`.
3. If needed on the target host, install or build OpenKinect `libfreenect2` and install `90-kinect2.rules`.
4. Replug the sensor and run `Protonect` to confirm the device opens and frames are received.
5. Record USB diagnostics and `dmesg` output if enumeration or frame capture fails.

Package readiness does not establish physical USB connectivity or successful frame capture.
