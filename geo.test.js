// Pruebas de geo.js. Se ejecutan con:  node --test geo.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./geo.js");

const cerca = (real, esperado, tolerancia, msg) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${msg || ""} real=${real} esperado=${esperado}±${tolerancia}`);

test("distancia: 0 m entre el mismo punto", () => {
  assert.equal(G.distanceMeters(4.6, -74.08, 4.6, -74.08), 0);
});

test("distancia: 1 grado de latitud son ~111,2 km", () => {
  cerca(G.distanceMeters(0, 0, 1, 0), 111195, 50);
});

test("distancia: Londres - París ~343,5 km", () => {
  cerca(G.distanceMeters(51.5074, -0.1278, 48.8566, 2.3522), 343500, 1500);
});

test("distancia: cruza el meridiano 180° sin romperse", () => {
  cerca(G.distanceMeters(0, 179.5, 0, -179.5), 111195, 50);
});

test("rumbo: norte, este, sur y oeste", () => {
  cerca(G.bearingDegrees(0, 0, 1, 0), 0, 0.001, "norte");
  cerca(G.bearingDegrees(0, 0, 0, 1), 90, 0.001, "este");
  cerca(G.bearingDegrees(0, 0, -1, 0), 180, 0.001, "sur");
  cerca(G.bearingDegrees(0, 0, 0, -1), 270, 0.001, "oeste");
});

test("rumbo: cruza el meridiano 180° hacia el este", () => {
  cerca(G.bearingDegrees(0, 179.5, 0, -179.5), 90, 0.001);
});

test("rumbo: Londres -> París ~148°", () => {
  cerca(G.bearingDegrees(51.5074, -0.1278, 48.8566, 2.3522), 148.1, 0.6);
});

test("normalizeAngle y angleDiff", () => {
  assert.equal(G.normalizeAngle(-10), 350);
  assert.equal(G.normalizeAngle(370), 10);
  assert.equal(G.angleDiff(350, 10), 20);
  assert.equal(G.angleDiff(10, 350), -20);
  assert.equal(Math.abs(G.angleDiff(0, 180)), 180);
});

test("arrowRotation: 0° es 'sigue recto'", () => {
  assert.equal(G.arrowRotation(90, 90), 0);
  assert.equal(G.arrowRotation(10, 350), 20);
  assert.equal(G.arrowRotation(350, 10), 340);
});

test("smoothAngle: pasa por el norte sin dar la vuelta larga", () => {
  assert.equal(G.smoothAngle(350, 10, 0.5), 0);
  assert.equal(G.smoothAngle(null, 123, 0.5), 123);
  cerca(G.smoothAngle(0, 90, 0.25), 22.5, 1e-9);
});

test("brújula con el teléfono plano: alpha 0 = norte, 90 = oeste", () => {
  cerca(G.headingFromOrientation(0, 0, 0), 0, 1e-9);
  cerca(G.headingFromOrientation(90, 0, 0), 270, 1e-9);
  cerca(G.headingFromOrientation(270, 0, 0), 90, 1e-9);
});

test("brújula con el teléfono vertical coincide con la plana (gamma 0)", () => {
  for (const alpha of [0, 45, 90, 180, 300]) {
    const plano = G.headingFromOrientation(alpha, 0, 0);
    const vertical = G.headingFromOrientation(alpha, 90, 0);
    cerca(G.angleDiff(plano, vertical), 0, 1e-6, `alpha=${alpha}`);
  }
});

test("brújula: sin datos devuelve null", () => {
  assert.equal(G.headingFromOrientation(null, 0, 0), null);
});

test("formatos de distancia y antigüedad", () => {
  assert.equal(G.formatDistance(12.4), "12 m");
  assert.equal(G.formatDistance(999.4), "999 m");
  assert.equal(G.formatDistance(1530), "1,5 km");
  assert.equal(G.formatDistance(25000), "25 km");
  assert.equal(G.formatDistance(null), "—");
  assert.equal(G.formatAge(2), "ahora");
  assert.equal(G.formatAge(12), "hace 12 s");
  assert.equal(G.formatAge(180), "hace 3 min");
  assert.equal(G.formatAge(7300), "hace 2 h");
  assert.equal(G.formatAge(undefined), "sin datos");
});
