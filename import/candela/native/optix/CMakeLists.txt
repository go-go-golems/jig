# native/optix — the OptiX backend for Candela (CANDELA-002 step 3). For now: the traversal spike candela-optix-ao.
#
#   cmake -G Ninja -S native/optix -B build/optix -DOptiX_INSTALL_DIR=$HOME/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64
#   ninja -C build/optix
#
# OptiX SDK 9.0.0 matches the DGX Spark's driver 580 (OptiX runtime ABI 110); SDK 9.1 needs a newer driver.
cmake_minimum_required(VERSION 3.24)
project(candela_optix LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
if(NOT CMAKE_CUDA_ARCHITECTURES)
  set(CMAKE_CUDA_ARCHITECTURES 121)   # GB10
endif()

set(OptiX_INSTALL_DIR "$ENV{HOME}/opt/NVIDIA-OptiX-SDK-9.0.0-linux64-aarch64" CACHE PATH "OptiX SDK root (contains include/optix.h)")
if(NOT EXISTS "${OptiX_INSTALL_DIR}/include/optix.h")
  message(FATAL_ERROR "OptiX SDK not found at ${OptiX_INSTALL_DIR}: pass -DOptiX_INSTALL_DIR=<sdk root>")
endif()
find_package(CUDAToolkit REQUIRED)

# nlohmann/json, header only (not installed system-wide on the Spark; `sudo apt install nlohmann-json3-dev` would also do)
find_package(nlohmann_json 3.11 QUIET)
if(NOT nlohmann_json_FOUND)
  include(FetchContent)
  FetchContent_Declare(json URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
                       URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d)
  FetchContent_MakeAvailable(json)
endif()

# device programs → OptiX-IR, loaded at run time
set(AO_OPTIXIR ${CMAKE_CURRENT_BINARY_DIR}/ao.optixir)
add_custom_command(
  OUTPUT ${AO_OPTIXIR}
  COMMAND ${CUDAToolkit_NVCC_EXECUTABLE} -optix-ir -arch=sm_${CMAKE_CUDA_ARCHITECTURES} -use_fast_math -lineinfo -std=c++17
          -I${OptiX_INSTALL_DIR}/include -I${CMAKE_CURRENT_SOURCE_DIR}/src ${CMAKE_CURRENT_SOURCE_DIR}/src/ao.cu -o ${AO_OPTIXIR}
  DEPENDS src/ao.cu src/params.h
  COMMENT "nvcc -optix-ir ao.cu")
add_custom_target(ao_ir ALL DEPENDS ${AO_OPTIXIR})

add_executable(candela-optix-ao src/main.cpp)
add_dependencies(candela-optix-ao ao_ir)
target_include_directories(candela-optix-ao PRIVATE ${OptiX_INSTALL_DIR}/include src)
target_compile_definitions(candela-optix-ao PRIVATE AO_OPTIXIR="${AO_OPTIXIR}")
target_link_libraries(candela-optix-ao PRIVATE CUDA::cudart nlohmann_json::nlohmann_json ${CMAKE_DL_LIBS})
