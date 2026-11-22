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

add_executable(candela-rt src/main.cpp src/js_runtime.cpp)
target_include_directories(candela-rt PRIVATE ${V8_INCLUDE_DIR} src)
target_link_libraries(candela-rt PRIVATE ${NODE_LIB} pthread)
