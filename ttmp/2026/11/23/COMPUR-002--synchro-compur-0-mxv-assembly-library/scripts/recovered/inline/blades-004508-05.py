p='/tmp/jig-blade/diagnose.mjs'
s=open(p).read().replace("[[0,'post2'],[0,'stop3'],[0,'stopLug'],[0,'drivePin'],[0,'post'],[3.7,'1.06'],[7.4,'post2'],[7.4,'stop3']]","[[3.7,'drivePin1'],[3.7,'drivePin2'],[3.7,'drivePin3'],[3.7,'drivePin4'],[3.7,'drivePin5'],[3.7,'drivePin']]").replace("if(stroke===3.7) lib=lib.replaceAll('slotW: 0.96','slotW: '+drop)\n else lib=", "lib=")
open('/tmp/jig-blade/pin.mjs','w').write(s)
