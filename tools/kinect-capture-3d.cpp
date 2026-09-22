#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include <libfreenect2/frame_listener.hpp>
#include <libfreenect2/frame_listener_impl.h>
#include <libfreenect2/libfreenect2.hpp>
#include <libfreenect2/packet_pipeline.h>
#include <libfreenect2/registration.h>

struct Point {
  float x;
  float y;
  float z;
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

int main(int argc, char **argv) {
  const std::string output = argc > 1 ? argv[1] : "kinect-frame.ply";
  libfreenect2::Freenect2 freenect2;
  if (freenect2.enumerateDevices() == 0) {
    std::cerr << "no Kinect v2 device connected\n";
    return 2;
  }

  libfreenect2::PacketPipeline *pipeline = new libfreenect2::CudaPacketPipeline(0);
  libfreenect2::Freenect2Device *device = freenect2.openDefaultDevice(pipeline);
  if (!device) {
    std::cerr << "failed to open Kinect with CUDA pipeline\n";
    return 3;
  }

  libfreenect2::SyncMultiFrameListener listener(
      libfreenect2::Frame::Color | libfreenect2::Frame::Ir | libfreenect2::Frame::Depth);
  device->setColorFrameListener(&listener);
  device->setIrAndDepthFrameListener(&listener);
  if (!device->start()) {
    std::cerr << "failed to start Kinect streams\n";
    device->close();
    return 4;
  }

  libfreenect2::Registration registration(device->getIrCameraParams(), device->getColorCameraParams());
  libfreenect2::Frame undistorted(512, 424, 4), registered(512, 424, 4);
  libfreenect2::FrameMap frames;
  if (!listener.waitForNewFrame(frames, 10000)) {
    std::cerr << "timed out waiting for Kinect frame\n";
    device->stop();
    device->close();
    return 5;
  }

  registration.apply(frames[libfreenect2::Frame::Color], frames[libfreenect2::Frame::Depth],
                     &undistorted, &registered);
  std::vector<Point> points;
  points.reserve(512 * 424);
  for (int row = 0; row < 424; ++row) {
    for (int col = 0; col < 512; ++col) {
      float x, y, z, packed_rgb;
      registration.getPointXYZRGB(&undistorted, &registered, row, col, x, y, z, packed_rgb);
      if (!std::isfinite(z) || z <= 0.0f || z > 10.0f) {
        continue;
      }
      const uint8_t *color = reinterpret_cast<const uint8_t *>(&packed_rgb);
      points.push_back({x, y, z, color[2], color[1], color[0]});
    }
  }
  listener.release(frames);
  device->stop();
  device->close();

  std::ofstream ply(output);
  if (!ply) {
    std::cerr << "failed to open output: " << output << "\n";
    return 6;
  }
  ply << "ply\nformat ascii 1.0\n";
  ply << "comment source Kinect v2 registered RGB-D frame\n";
  ply << "element vertex " << points.size() << "\n";
  ply << "property float x\nproperty float y\nproperty float z\n";
  ply << "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n";
  for (const Point &point : points) {
    ply << point.x << ' ' << point.y << ' ' << point.z << ' ' << static_cast<int>(point.r)
        << ' ' << static_cast<int>(point.g) << ' ' << static_cast<int>(point.b) << '\n';
  }
  std::cout << "wrote " << points.size() << " points to " << output << '\n';
  return 0;
}
