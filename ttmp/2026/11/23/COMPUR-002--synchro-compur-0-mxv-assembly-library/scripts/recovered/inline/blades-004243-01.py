import math
for x,y in [(-13.3838,-12.4806),(-14.1136,-11.6875),(-10.7535,-14.8376),(13.8152,-1.2358),(17.2595,13.2213)]:
 print(math.hypot(x,y), math.degrees(math.atan2(y,x)))
