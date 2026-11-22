import { scene, shape, material, light, camera, units as u } from 'candela';

const g = 9.81, h0 = 1.0;
export default scene()
  .add(shape.sphere(0.18).at(-1, 0.18, 0).id('ball').material(material.plastic('#d03a2a', 0.2))
    .behavior((self, { t }) => {                                          // a bouncing ball: a parabola, period √(8h/g)
      const T = Math.sqrt(8 * h0 / g), s = (t % T) - T / 2;
      self.position.y = 0.18 + h0 - 0.5 * g * s * s;
    }))
  .add(shape.cone(0.22, 0.4).at(0.2, 0.2, 0).rotateX(u.deg(180)).id('top').material(material.pbr().baseColor('#e0b040').roughness(0.3))
    .behavior((self, { t, dt }) => { self.rotation.y += dt * 8; self.rotation.z = 0.15 * Math.sin(t * 1.3); }))
  .add(shape.sphere(0.12).at(1.2, 1.0, 0).id('bob').material(material.metal('brass', { roughness: 0.2 }))
    .behavior((self, { t }) => {                                          // a pendulum, small-angle: θ = θ0 cos(√(g/L) t)
      const L = 0.9, th = 0.5 * Math.cos(Math.sqrt(g / L) * t);
      self.position.x = 1.2 + L * Math.sin(th); self.position.y = 1.9 - L * Math.cos(th);
    }))
  .add(shape.cylinder(0.02, 0.1).at(1.2, 1.95, 0).material(material.metal('Fe')))
  .add(shape.plane(30).material(material.pbr().baseColor(0.5).roughness(0.7)))
  .light(light.daylight({ elevation: u.deg(50), azimuth: u.deg(30) }))
  .camera(camera.thinLens().at(0.1, 1.1, 3.2).lookAt(0.1, 0.75, 0).focal(u.mm(40)));
