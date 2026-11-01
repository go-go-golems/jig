# Prompt-cache measurements, 2026-10-31

## Raw usage objects from lunaroute (usage-proxy log; probe: 4 forced eval rounds + answer, reference.md as prefix)
```
21:36:07 status 200 /v1/chat/completions
21:36:07 {"model":"glm-5.3-flash","usage":{"completion_tokens":24,"completion_tokens_details":{"reasoning_tokens":12},"prompt_tokens":4302,"prompt_tokens_details":{"cached_tokens":0},"reasoning_tokens":12,"total_tokens":4326}}
21:36:07 status 200 /v1/chat/completions
21:36:07 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4333,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4346}}
21:36:08 status 200 /v1/chat/completions
21:36:08 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4353,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4366}}
21:36:08 status 200 /v1/chat/completions
21:36:08 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4373,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4386}}
21:36:08 status 200 /v1/chat/completions
21:36:08 {"model":"glm-5.3-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4393,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4396}}
21:36:10 status 200 /v1/chat/completions
21:36:11 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":179,"completion_tokens_details":{"reasoning_tokens":139},"prompt_tokens":4639,"prompt_tokens_details":{"cached_tokens":0,"created_cache_tokens":4608},"total_tokens":4818}}
21:36:13 status 200 /v1/chat/completions
21:36:13 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":48,"completion_tokens_details":{"reasoning_tokens":8},"prompt_tokens":4832,"prompt_tokens_details":{"cached_tokens":4608,"created_cache_tokens":128},"total_tokens":4880}}
21:36:14 status 200 /v1/chat/completions
21:36:14 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4894,"prompt_tokens_details":{"cached_tokens":4864,"created_cache_tokens":0},"total_tokens":4934}}
21:36:15 status 200 /v1/chat/completions
21:36:15 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4948,"prompt_tokens_details":{"cached_tokens":4864,"created_cache_tokens":0},"total_tokens":4988}}
21:36:15 status 200 /v1/chat/completions
21:36:15 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":5002,"prompt_tokens_details":{"cached_tokens":4864,"created_cache_tokens":128},"total_tokens":5005}}
21:36:26 status 200 /v1/chat/completions
21:36:26 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4302,"prompt_tokens_details":{"cached_tokens":0},"reasoning_tokens":1,"total_tokens":4315}}
21:36:27 status 200 /v1/chat/completions
21:36:27 {"model":"glm-5.3-flash","usage":{"completion_tokens":18,"completion_tokens_details":{"reasoning_tokens":6},"prompt_tokens":4322,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":6,"total_tokens":4340}}
21:36:27 status 200 /v1/chat/completions
21:36:27 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4347,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4360}}
21:36:28 status 200 /v1/chat/completions
21:36:28 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4367,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4380}}
21:36:28 status 200 /v1/chat/completions
21:36:28 {"model":"glm-5.3-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4387,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4390}}
21:36:29 status 200 /v1/chat/completions
21:36:29 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4639,"prompt_tokens_details":{"cached_tokens":0,"created_cache_tokens":4608},"total_tokens":4679}}
21:36:29 status 200 /v1/chat/completions
21:36:30 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":85,"completion_tokens_details":{"reasoning_tokens":45},"prompt_tokens":4693,"prompt_tokens_details":{"cached_tokens":4608,"created_cache_tokens":0},"total_tokens":4778}}
21:36:30 status 200 /v1/chat/completions
21:36:30 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4792,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":0},"total_tokens":4832}}
21:36:31 status 200 /v1/chat/completions
21:36:31 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4846,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":0},"total_tokens":4886}}
21:36:32 status 200 /v1/chat/completions
21:36:32 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4900,"prompt_tokens_details":{"cached_tokens":4864,"created_cache_tokens":0},"total_tokens":4903}}
21:36:48 status 200 /v1/chat/completions
21:36:48 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4302,"prompt_tokens_details":{"cached_tokens":0},"reasoning_tokens":1,"total_tokens":4315}}
21:36:48 status 200 /v1/chat/completions
21:36:48 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4322,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4335}}
21:36:48 status 200 /v1/chat/completions
21:36:49 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4342,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4355}}
21:36:49 status 200 /v1/chat/completions
21:36:49 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4362,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4375}}
21:36:49 status 200 /v1/chat/completions
21:36:49 {"model":"glm-5.3-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4382,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4385}}
21:36:49 status 200 /v1/chat/completions
21:36:49 {"model":"glm-5.3-flash","usage":{"completion_tokens":21,"completion_tokens_details":{"reasoning_tokens":9},"prompt_tokens":4302,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":9,"total_tokens":4323}}
21:36:50 status 200 /v1/chat/completions
21:36:50 {"model":"glm-5.3-flash","usage":{"completion_tokens":18,"completion_tokens_details":{"reasoning_tokens":6},"prompt_tokens":4330,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":6,"total_tokens":4348}}
21:36:50 status 200 /v1/chat/completions
21:36:50 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4355,"prompt_tokens_details":{"cached_tokens":4096},"reasoning_tokens":1,"total_tokens":4368}}
21:36:51 status 200 /v1/chat/completions
21:36:51 {"model":"glm-5.3-flash","usage":{"completion_tokens":13,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4375,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4388}}
21:36:51 status 200 /v1/chat/completions
21:36:51 {"model":"glm-5.3-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":1},"prompt_tokens":4395,"prompt_tokens_details":{"cached_tokens":4352},"reasoning_tokens":1,"total_tokens":4398}}
21:36:51 status 200 /v1/chat/completions
21:36:51 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":97,"completion_tokens_details":{"reasoning_tokens":57},"prompt_tokens":4639,"prompt_tokens_details":{"cached_tokens":0,"created_cache_tokens":4608},"total_tokens":4736}}
21:36:52 status 200 /v1/chat/completions
21:36:53 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":60,"completion_tokens_details":{"reasoning_tokens":20},"prompt_tokens":4750,"prompt_tokens_details":{"cached_tokens":4608,"created_cache_tokens":128},"total_tokens":4810}}
21:36:53 status 200 /v1/chat/completions
21:36:53 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4824,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":0},"total_tokens":4864}}
21:36:54 status 200 /v1/chat/completions
21:36:54 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4878,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":128},"total_tokens":4918}}
21:36:55 status 200 /v1/chat/completions
21:36:55 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4932,"prompt_tokens_details":{"cached_tokens":4864,"created_cache_tokens":0},"total_tokens":4935}}
21:36:56 status 200 /v1/chat/completions
21:36:56 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4639,"prompt_tokens_details":{"cached_tokens":4608,"created_cache_tokens":0},"total_tokens":4679}}
21:36:57 status 200 /v1/chat/completions
21:36:57 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":51,"completion_tokens_details":{"reasoning_tokens":11},"prompt_tokens":4693,"prompt_tokens_details":{"cached_tokens":4608,"created_cache_tokens":0},"total_tokens":4744}}
21:36:58 status 200 /v1/chat/completions
21:36:58 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4758,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":0},"total_tokens":4798}}
21:36:58 status 200 /v1/chat/completions
21:36:58 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":40,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4812,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":0},"total_tokens":4852}}
21:36:58 status 200 /v1/chat/completions
21:36:58 {"model":"deepseek-4.1-flash","usage":{"completion_tokens":3,"completion_tokens_details":{"reasoning_tokens":0},"prompt_tokens":4866,"prompt_tokens_details":{"cached_tokens":4736,"created_cache_tokens":128},"total_tokens":4869}}
```

## jigcad serve log lines (real agent turns, A-01, fresh server process)
```
2026/10/31 21:37:40 sample jcdc79ffed747628e0855d7890 tier=default model=lunaroute/glm-5.3-flash asked="" tools=8 in=170359 cacheRead=149248 cacheWrite=0 out=1650 ms=16668 outcome=ok
2026/10/31 21:37:56 sample jce7bd9b89ee765e9f6f613fbe tier=complex model=lunaroute/deepseek-4.1-flash asked="" tools=1 in=39988 cacheRead=20224 cacheWrite=0 out=512 ms=3478 outcome=ok
```
