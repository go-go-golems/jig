---
id: M-13
title: Infinity mirror
group: Materials
about: Two facing mirrors and a light between them: each reflection is one more bounce, until the path depth runs out.
tries: Lower the max depth to 4 and count the reflections|Tint one mirror slightly — what happens deep in the tunnel?
docs: renderer
---
# Infinity mirror

A real mirror reflects about 90–97 %. Two facing mirrors give a tunnel of images, each dimmer by the product of the reflectances, and each one **path bounce** deeper. The engine here traces up to 24 bounces, so the tunnel ends where the depth limit does — Russian roulette is pushed back for the same reason.

Mirror reflections are a delta BSDF: they cannot be sampled by next-event estimation, so the light seen in the mirrors comes entirely from BSDF sampling with MIS weight 1.
