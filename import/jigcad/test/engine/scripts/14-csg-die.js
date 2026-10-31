// OpenSCAD-style CSG: a die = cube ∩ ball − three rods. Euler–Poincaré gives genus 5.
const cube = j.box(mm(20), mm(20), mm(20), { center: true })
const ball = j.sphere(mm(13))
const rod = j.cyl(mm(5), mm(40), { center: true })
const rods = rod.union(rod.moved(j.tx.rotate(j.axis.X, deg(90)))).union(rod.moved(j.tx.rotate(j.axis.Y, deg(90))))
return j.part('die').add(cube.intersect(ball).subtract(rods), { id: 'body' })
