# Kinect v2 host validation

Tracking issue: [#131](https://github.com/NeonButrfly/tichuml/issues/131)

## Current state

On 2026-09-20, `tichuml` (`192.168.50.36`) was reachable as `kay` and reported Ubuntu 24.04.3. The required build packages were installed, OpenKinect `libfreenect2` was built successfully under `/home/kay/src/libfreenect2`, and the user-prefix installation is `/home/kay/freenect2`. The root-owned `/etc/udev/rules.d/90-kinect2.rules` is installed.

`lsusb` still did not show the Kinect v2 device (`045e:02c4`). `Protonect` started successfully but reported `found 0 devices` and exited with `no device connected!`. The driver stack is ready, but physical USB/frame capture is not validated.

`tichuml1` (`192.168.50.196`) is now reachable with key-based SSH. Its USB tree shows an Acer USB webcam and Bluetooth adapter, but no Kinect v2 device (`045e:02c4`). No Kinect/freenect2 udev rule or installed library was found on that host.

On 2026-09-20, the same dependency set was installed on `tichuml1`, OpenKinect `libfreenect2` was built under `/home/kay/src/libfreenect2`, and the user-prefix installation completed at `/home/kay/freenect2`. The root-owned `/etc/udev/rules.d/90-kinect2.rules` was installed and reloaded. `Protonect` runs there but reports `found 0 devices` / `no device connected!`.

On 2026-09-21, the configured `linux32gb` host (`192.168.50.235`, the host referred to as `linux32`) was reachable as `kay` on Ubuntu 26.04.1 with kernel `7.0.0-31-generic`. The host enumerated a Microsoft Xbox NUI Sensor with serial `117555433747` and VID:PID `045e:02c4`. The OpenKinect `libfreenect2` v0.2.0 CPU build completed under `/home/kay/src/libfreenect2` and was installed under `/home/kay/freenect2`; `/etc/udev/rules.d/90-kinect2.rules` is installed and `udevadm test` confirms it applies `MODE="0666"` to the Kinect device. Passwordless sudo was also configured for `kay` in `/etc/sudoers.d/90-kay-nopasswd` and validated with `visudo`.

`Protonect` enumerates the sensor (`found valid Kinect v2 @1:5`) but image capture is not yet validated. Initially the Kinect audio interfaces were claimed by `snd-usb-audio`; detaching only interfaces `1-2:1.1` and `1-2:1.2` changed the failure to `LIBUSB_ERROR_PIPE` while enabling USB power state U1. `lsusb -t` shows the sensor on Bus 001 at 480 Mbps (USB 2), while the SuperSpeed bus is empty. A targeted unbind/rebind did not restore SuperSpeed. No RGB image artifact was retrieved; the remaining blocker is a stable USB 3 connection, which requires a physical cable/port replug or replacement before rerunning `Protonect`.

After the sensor was moved to the USB-C path, it re-enumerated at a different USB 2 port (`1-1`) but still negotiated only 480 Mbps; the host's 10-Gbps SuperSpeed bus remained empty. USB-C is supported in principle, but this particular port/cable/adapter path is not carrying SuperSpeed data. `Protonect` again found the sensor but hit the `snd-usb-audio` interface claim until that interface is detached. A known-good USB 3.x C-to-C cable or USB-C-to-USB-A adapter/port, with adequate power, is required before image capture can be verified.

## Required validation

After authorized SSH and administrative access are available:

1. Confirm `lsusb` shows Microsoft `Xbox NUI Sensor` with VID:PID `045e:02c4`.
2. Confirm the device is on a stable USB 3 path with `lsusb -t`.
3. If needed on the target host, install or build OpenKinect `libfreenect2` and install `90-kinect2.rules`.
4. If `snd-usb-audio` claims the Kinect interfaces, detach only the Kinect audio interfaces before opening it with libfreenect2.
5. Replug the sensor and run `Protonect` to confirm the device opens and frames are received; save an RGB frame as evidence.
6. Record USB diagnostics and `dmesg` output if enumeration or frame capture fails.

Package readiness does not establish physical USB connectivity or successful frame capture.
