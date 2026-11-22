# native/rt — candela-rt, Candela's native render runtime (CANDELA-002 design doc 02).
# Phase 0: V8 embedded through Ubuntu's libnode (Node 18.19, V8 10.2): `sudo apt install libnode-dev`.
#
#   cmake -G Ninja -S native/rt -B build/rt && ninja -C build/rt
cmake_minimum_required(VERSION 3.24)
project(candela_rt LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE RelWithDebInfo)
endif()

# V8 from libnode: headers in /usr/include/node, library libnode.so. Built without pointer compression and without
# 31-bit Smis (config.gypi), which matches the headers' defaults, so no V8_* defines are needed.
find_path(V8_INCLUDE_DIR v8.h PATHS /usr/include/node NO_DEFAULT_PATH REQUIRED)
find_library(NODE_LIB node REQUIRED)

# Phase 2: the plain-CUDA target — NVRTC compiles each scene's translated program, the driver API runs it.
find_package(CUDAToolkit REQUIRED)

# Phase 3: the OptiX target. OptiX SDK 9.0.0 matches the Spark's driver 580 (runtime ABI 110); headers only, the
# implementation is in the driver (optixInit loads it).
set(OptiX_INSTALL_DIR "$ENV{HOME}/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64" CACHE PATH "OptiX SDK root (contains include/optix.h)")
if(NOT EXISTS "${OptiX_INSTALL_DIR}/include/optix.h")
  message(FATAL_ERROR "OptiX SDK not found at ${OptiX_INSTALL_DIR}: pass -DOptiX_INSTALL_DIR=<sdk root>")
endif()

find_package(ZLIB REQUIRED)
# WebSocket server for `candela-rt serve` (phase 5): IXWebSocket, no TLS (the server sits on the local network)
include(FetchContent)
set(USE_TLS OFF CACHE BOOL "" FORCE)
set(USE_ZLIB ON CACHE BOOL "" FORCE)
set(IXWEBSOCKET_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(ixwebsocket GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git GIT_TAG v11.4.6 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(ixwebsocket)
add_executable(candela-rt src/main.cpp src/js_runtime.cpp src/cuda_runner.cpp src/optix_renderer.cpp src/post.cpp src/image_io.cpp src/jpeg.cpp src/serve.cpp)
target_include_directories(candela-rt PRIVATE ${V8_INCLUDE_DIR} ${OptiX_INSTALL_DIR}/include src)
target_link_libraries(candela-rt PRIVATE ${NODE_LIB} CUDA::cuda_driver CUDA::nvrtc CUDA::nvjpeg CUDA::cudart ZLIB::ZLIB ixwebsocket pthread ${CMAKE_DL_LIBS})
# NVRTC needs the OptiX device headers to compile a scene's OptiX program
target_compile_definitions(candela-rt PRIVATE CANDELA_OPTIX_INCLUDE_DIR="${OptiX_INSTALL_DIR}/include" CANDELA_CUDA_INCLUDE_DIR="${CUDAToolkit_INCLUDE_DIRS}")
# where NVRTC finds candela_wgsl.h and the target headers when --kernels is not given
target_compile_definitions(candela-rt PRIVATE CANDELA_KERNELS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/kernels")
