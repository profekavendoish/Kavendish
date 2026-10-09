// Funciones de cálculo "puras": reciben números y devuelven números/textos.
// No tocan la pantalla ni internet, por eso se pueden probar con `node --test`.
// En el navegador quedan disponibles como `Geo.distanceMeters(...)`, etc.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Geo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const RADIO_TIERRA_M = 6371008.8;
  const aRad = (g) => (g * Math.PI) / 180;
  const aGrados = (r) => (r * 180) / Math.PI;

  // Lleva cualquier ángulo al rango 0..360.
  function normalizeAngle(a) {
    return ((a % 360) + 360) % 360;
  }

  // Diferencia más corta entre dos ángulos, en el rango -180..180.
  // Ej.: de 350° a 10° son +20°, no -340°.
  function angleDiff(desde, hasta) {
    return ((((hasta - desde) % 360) + 540) % 360) - 180;
  }

  // Distancia en metros entre dos puntos GPS (fórmula haversine).
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const dLat = aRad(lat2 - lat1);
    const dLon = aRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Rumbo inicial (0° = norte, 90° = este) para ir del punto 1 al punto 2.
  function bearingDegrees(lat1, lon1, lat2, lon2) {
    const f1 = aRad(lat1);
    const f2 = aRad(lat2);
    const dL = aRad(lon2 - lon1);
    const y = Math.sin(dL) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dL);
    return normalizeAngle(aGrados(Math.atan2(y, x)));
  }

  // Cuánto hay que girar la flecha en pantalla: rumbo hacia el amigo menos
  // la dirección hacia donde apunta el teléfono. 0° = "sigue recto".
  function arrowRotation(bearing, heading) {
    return normalizeAngle(bearing - heading);
  }

  // Suavizado circular: acerca `previo` a `nuevo` una fracción `alfa` (0..1).
  // Evita que la flecha tiemble y maneja bien el salto 359° -> 1°.
  function smoothAngle(previo, nuevo, alfa) {
    if (previo == null) return normalizeAngle(nuevo);
    return normalizeAngle(previo + alfa * angleDiff(previo, nuevo));
  }

  // Dirección hacia donde apunta el teléfono (0° = norte) a partir de los
  // ángulos del sensor (alpha, beta, gamma, en grados, estándar W3C).
  // - Teléfono casi plano o inclinado (como una brújula): apunta el borde superior.
  // - Teléfono casi vertical (como una cámara): apunta la cámara trasera.
  function headingFromOrientation(alpha, beta, gamma) {
    if (alpha == null) return null;
    const b = beta == null ? 0 : beta;
    const g = gamma == null ? 0 : gamma;
    if (Math.abs(b) < 60) return normalizeAngle(360 - alpha);
    const A = aRad(alpha);
    const B = aRad(b);
    const G = aRad(g);
    const este = -Math.sin(G) * Math.cos(A) - Math.cos(G) * Math.sin(B) * Math.sin(A);
    const norte = -Math.sin(G) * Math.sin(A) + Math.cos(G) * Math.sin(B) * Math.cos(A);
    return normalizeAngle(aGrados(Math.atan2(este, norte)));
  }

  // 12.4 -> "12 m", 1530 -> "1,5 km"
  function formatDistance(m) {
    if (m == null || !isFinite(m)) return "—";
    if (m < 1000) return Math.round(m) + " m";
    const km = m / 1000;
    return (km < 10 ? km.toFixed(1) : Math.round(km)).toString().replace(".", ",") + " km";
  }

  // Segundos -> "ahora", "hace 12 s", "hace 3 min", "hace 2 h".
  function formatAge(segundos) {
    if (segundos == null || !isFinite(segundos)) return "sin datos";
    if (segundos < 5) return "ahora";
    if (segundos < 60) return "hace " + Math.round(segundos) + " s";
    if (segundos < 3600) return "hace " + Math.floor(segundos / 60) + " min";
    return "hace " + Math.floor(segundos / 3600) + " h";
  }

  return {
    normalizeAngle,
    angleDiff,
    distanceMeters,
    bearingDegrees,
    arrowRotation,
    smoothAngle,
    headingFromOrientation,
    formatDistance,
    formatAge,
  };
});
