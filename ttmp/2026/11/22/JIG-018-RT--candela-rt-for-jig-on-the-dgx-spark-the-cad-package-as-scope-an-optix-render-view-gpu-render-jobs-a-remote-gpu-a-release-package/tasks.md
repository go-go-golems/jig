# Tasks

## TODO
- [ ] T0: candela-rt built from jig on the Spark (make web candela-rt, digest compare, capabilities up); optionally register the nvidia runner and set NVIDIA_RUNNER <!-- t:p0vo -->
- [ ] T1: candela-rt takes a scope (HeadlessOptions.scope, openRender; serve files.scope and a scope message); same irHash as the page for a jig model <!-- t:hsrn -->
- [ ] T2: Render view OptiX mode (src/render/rt.js client, RenderHost backend 'optix', poses and motion messages); UI test on the Spark <!-- t:q1yg -->
- [ ] T3: GPU render jobs (serve job/cancel messages, jigcad --jobs-dir and GET /api/render/jobs, renderJob in OptiX mode) <!-- t:kufo -->
- [ ] T4: remote GPU (jigcad --render ws://host:port --render-token; probe instead of child; exact token check, V8 watchdog) <!-- t:57lx -->
- [ ] T5: release package (no absolute build paths at run time; tarball on tags from candela-rt.yml) <!-- t:9itw -->
