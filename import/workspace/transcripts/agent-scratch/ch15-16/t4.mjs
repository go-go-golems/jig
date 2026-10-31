// check: min-norm z via 2x2 (M M^T) w = rhs, z = M^T w, against the engine's (M^T M + mu I) z = M^T rhs
const M = [-0.080819, 0.483734, -0.097312, 0.447046, 0.113522, 0.193035]; // rounded, only to illustrate conditioning
