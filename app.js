// Lógica de la página: GPS, brújula, compartir posiciones y dibujar las flechas.
// Los cálculos matemáticos viven en geo.js; aquí solo se conecta todo.
(() => {
  "use strict";

  const G = window.Geo;
  const CFG = window.KAVENDISH_CONFIG || {};
  const DEMO = new URLSearchParams(location.search).get("demo") === "1";

  const PALETA = ["#ff5c8a", "#4cc9f0", "#ffd166", "#06d6a0", "#b388ff", "#ff9f1c"];
  const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789"; // sin letras que se confunden (i, l, o, 0, 1)
  const MS_ENVIO = 5000; // cada cuánto enviamos nuestra posición
  const MS_ENVIO_AHORRO = 15000;
  const CADUCA_S = 60; // pasado este tiempo, la posición de un amigo se marca como "vieja"
  const MAX_AMIGOS = 12;
  const CERCA_MIN_M = 15; // por debajo de esto el GPS no distingue la dirección
  const CERCA_MAX_M = 40;

  const $ = (id) => document.getElementById(id);
  const el = {
    inicio: $("pantalla-inicio"),
    sala: $("pantalla-sala"),
    form: $("form-inicio"),
    nombre: $("nombre"),
    codigo: $("codigo"),
    detalleCodigo: $("detalle-codigo"),
    avisoSala: $("aviso-sala"),
    avisoConfig: $("aviso-config"),
    btnEntrar: $("btn-entrar"),
    salaCodigo: $("sala-codigo"),
    estadoCon: $("estado-conexion"),
    estadoTxt: $("estado-texto"),
    banner: $("banner-permisos"),
    bannerTxt: $("banner-texto"),
    btnActivar: $("btn-activar"),
    lista: $("lista"),
    vacio: $("vacio"),
    miEstado: $("mi-estado"),
    btnInvitar: $("btn-invitar"),
    btnPunto: $("btn-punto"),
    btnEnviar: $("btn-enviar"),
    btnAhorro: $("btn-ahorro"),
    btnPausa: $("btn-pausa"),
    btnSalir: $("btn-salir"),
    toast: $("toast"),
    tpl: $("tpl-tarjeta"),
  };

  const estado = {
    yo: { id: "", nombre: "" },
    sala: null,
    pos: null, // { lat, lon, acc, t }
    rumbo: null, // hacia dónde apunta el teléfono (suavizado)
    ultimoRumbo: 0,
    rumboGps: null, // { valor, t } rumbo según el GPS al caminar (plan B)
    brujula: "apagada", // apagada | pidiendo | esperando | ok | denegada | sinsensor
    gps: "apagado", // apagado | buscando | ok | denegado
    conexion: "apagada", // apagada | conectando | ok | error
    amigos: new Map(), // id -> { id, nombre, color, lat, lon, acc, rx, pausado }
    encuentro: null, // { por, lat, lon, rx, v }
    compartir: true,
    ahorro: false,
    canal: null,
  };

  let supa = null;
  let temporizadorEnvio = null;
  let watchId = null;
  let wakeLock = null;
  let ocultoDesde = 0;
  let renderPendiente = false;
  const tarjetas = new Map(); // clave -> { root, flecha, nombre, distancia, detalle, quitar, rot }

  // ---------- utilidades ----------
  function leer(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function guardar(k, v) {
    try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ }
  }
  function aleatorio(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join("");
  }
  function colorDe(id) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETA[h % PALETA.length];
  }
  function codigoDeTexto(t) {
    if (!t) return null;
    const s = String(t).trim();
    const m = s.match(/sala=([a-z0-9]{6,32})/i) || s.match(/^([a-z0-9]{6,32})$/i);
    return m ? m[1].toLowerCase() : null;
  }
  const numero = (x, min, max) => typeof x === "number" && isFinite(x) && x >= min && x <= max;
  const nombreLimpio = (n) => String(n == null ? "" : n).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 20) || "Amigo";
  const r6 = (x) => Math.round(x * 1e6) / 1e6;

  let temporizadorToast;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { el.toast.hidden = true; }, 3500);
  }
  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- GPS ----------
  function iniciarGPS() {
    if (!("geolocation" in navigator)) { estado.gps = "denegado"; return; }
    if (watchId != null) return;
    estado.gps = "buscando";
    watchId = navigator.geolocation.watchPosition(alRecibirGPS, alFallarGPS, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 30000,
    });
  }
  function detenerGPS() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  function alRecibirGPS(p) {
    const c = p.coords;
    const primera = !estado.pos;
    estado.pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: Date.now() };
    estado.gps = "ok";
    if (c.heading != null && isFinite(c.heading) && c.speed != null && c.speed > 1.5) {
      estado.rumboGps = { valor: c.heading, t: Date.now() };
    }
    if (primera) enviarPos();
    actualizarBanner();
    pedirRender();
  }
  function alFallarGPS(e) {
    if (e && e.code === 1) { estado.gps = "denegado"; detenerGPS(); } // permiso denegado
    else estado.gps = estado.pos ? "ok" : "buscando"; // sin señal momentánea: seguimos intentando
    actualizarBanner();
    pedirRender();
  }

  // ---------- brújula ----------
  let brujulaEscuchando = false;
  function pedirBrujula() {
    // En iPhone esto DEBE llamarse directamente desde un toque del usuario.
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { estado.brujula = "sinsensor"; return Promise.resolve(); }
    if (typeof DOE.requestPermission === "function") {
      estado.brujula = "pidiendo";
      return DOE.requestPermission()
        .then((r) => {
          if (r === "granted") escucharBrujula();
          else estado.brujula = "denegada";
        })
        .catch(() => { estado.brujula = "denegada"; });
    }
    escucharBrujula();
    return Promise.resolve();
  }
  function escucharBrujula() {
    if (brujulaEscuchando) return;
    brujulaEscuchando = true;
    estado.brujula = "esperando";
    window.addEventListener("deviceorientationabsolute", alOrientar, true); // Android (Chrome)
    window.addEventListener("deviceorientation", alOrientar, true); // iPhone
  }
  function apagarBrujula() {
    window.removeEventListener("deviceorientationabsolute", alOrientar, true);
    window.removeEventListener("deviceorientation", alOrientar, true);
    brujulaEscuchando = false;
    estado.brujula = "apagada";
    estado.rumbo = null;
  }
  function alOrientar(e) {
    let valor = null;
    if (typeof e.webkitCompassHeading === "number" && !(e.webkitCompassHeadingAccuracy < 0)) {
      valor = e.webkitCompassHeading; // iPhone ya entrega el rumbo respecto al norte
    } else if (e.type === "deviceorientationabsolute" || e.absolute === true) {
      valor = G.headingFromOrientation(e.alpha, e.beta, e.gamma);
    }
    if (valor == null || isNaN(valor)) return; // lectura "relativa": no sirve como brújula
    estado.rumbo = G.smoothAngle(estado.rumbo, valor, 0.25);
    estado.ultimoRumbo = Date.now();
    estado.brujula = "ok";
    pedirRender();
  }
  // Dirección usable ahora mismo: brújula, o rumbo GPS si caminas, o null.
  function rumboActual() {
    const ahora = Date.now();
    if (estado.rumbo != null && ahora - estado.ultimoRumbo < 3000) return estado.rumbo;
    if (estado.rumboGps && ahora - estado.rumboGps.t < 4000) return estado.rumboGps.valor;
    return null;
  }

  // ---------- pantalla encendida ----------
  async function pedirPantallaEncendida() {
    try {
      if ("wakeLock" in navigator && !wakeLock && !estado.ahorro) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch { /* el navegador puede negarse (batería baja); no es grave */ }
  }
  function soltarPantalla() {
    try { if (wakeLock) wakeLock.release(); } catch { /* nada */ }
    wakeLock = null;
  }

  // ---------- compartir en tiempo real (Supabase Realtime Broadcast) ----------
  function setConexion(c) {
    estado.conexion = c;
    const textos = { ok: "Conectado", conectando: "Conectando…", error: "Sin conexión", apagada: "Sin conexión" };
    el.estadoTxt.textContent = DEMO ? "Demo" : textos[c];
    el.estadoCon.dataset.estado = c === "apagada" ? "error" : c;
  }

  function unirseCanal() {
    if (!supa || !estado.sala) return;
    cerrarCanal();
    setConexion("conectando");
    const ch = supa.channel("sala-" + estado.sala, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => alRecibirPos(payload))
      .on("broadcast", { event: "hello" }, ({ payload }) => alRecibirHello(payload))
      .on("broadcast", { event: "meet" }, ({ payload }) => alRecibirEncuentro(payload))
      .on("broadcast", { event: "meet_clear" }, () => { estado.encuentro = null; pedirRender(); })
      .on("broadcast", { event: "pause" }, ({ payload }) => alRecibirPausa(payload))
      .on("broadcast", { event: "bye" }, ({ payload }) => {
        if (payload && typeof payload.id === "string") estado.amigos.delete(payload.id);
        pedirRender();
      })
      .subscribe((s) => {
        if (estado.canal !== ch) return; // aviso de un canal viejo
        if (s === "SUBSCRIBED") {
          setConexion("ok");
          enviar("hello", { id: estado.yo.id });
          enviarPos();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setConexion("error");
        else if (s === "CLOSED") setConexion("error");
      });
    estado.canal = ch;
  }
  function cerrarCanal() {
    const ch = estado.canal;
    estado.canal = null;
    if (ch && supa) supa.removeChannel(ch);
  }
  function enviar(evento, payload) {
    const ch = estado.canal;
    if (!ch || estado.conexion !== "ok") return;
    try {
      const r = ch.send({ type: "broadcast", event: evento, payload });
      if (r && r.catch) r.catch(() => {});
    } catch { /* se reintenta en el siguiente envío */ }
  }
  function enviarPos() {
    if (!estado.compartir || !estado.pos || !estado.sala) return;
    const edad = Math.max(0, Math.round((Date.now() - estado.pos.t) / 1000));
    if (edad > 600) return;
    enviar("pos", {
      id: estado.yo.id,
      nombre: estado.yo.nombre,
      lat: r6(estado.pos.lat),
      lon: r6(estado.pos.lon),
      acc: Math.round(estado.pos.acc || 0),
      edad,
    });
  }
  function reiniciarTemporizadorEnvio() {
    clearInterval(temporizadorEnvio);
    temporizadorEnvio = setInterval(enviarPos, estado.ahorro ? MS_ENVIO_AHORRO : MS_ENVIO);
  }

  // Todo lo que llega por la red es "no confiable": se valida antes de usarlo.
  const idValido = (id) => typeof id === "string" && /^[a-z0-9]{6,32}$/.test(id) && id !== estado.yo.id;

  function alRecibirPos(p) {
    if (!p || !idValido(p.id) || !numero(p.lat, -90, 90) || !numero(p.lon, -180, 180)) return;
    let a = estado.amigos.get(p.id);
    if (!a) {
      if (estado.amigos.size >= MAX_AMIGOS) return;
      a = { id: p.id, color: colorDe(p.id) };
      estado.amigos.set(p.id, a);
    }
    const edad = numero(p.edad, 0, 86400) ? p.edad : 0;
    a.nombre = nombreLimpio(p.nombre);
    a.lat = p.lat;
    a.lon = p.lon;
    a.acc = numero(p.acc, 0, 100000) ? p.acc : 50;
    a.rx = Date.now() - edad * 1000; // momento real de esa lectura, medido con NUESTRO reloj
    a.pausado = false;
    pedirRender();
  }
  function alRecibirHello(p) {
    if (!p || !idValido(p.id)) return;
    // Quien llega nuevo pide "hola": le contestamos con nuestra posición y el punto de encuentro.
    setTimeout(() => {
      enviarPos();
      if (estado.compartir === false) enviar("pause", { id: estado.yo.id, pausado: true });
      const e = estado.encuentro;
      if (e) enviar("meet", { por: e.por, lat: e.lat, lon: e.lon, v: e.v });
    }, Math.random() * 600);
  }
  function alRecibirEncuentro(p) {
    if (!p || !numero(p.lat, -90, 90) || !numero(p.lon, -180, 180) || !numero(p.v, 0, 1e14)) return;
    if (estado.encuentro && estado.encuentro.v >= p.v) return; // ya tenemos uno igual o más nuevo
    estado.encuentro = { por: nombreLimpio(p.por), lat: p.lat, lon: p.lon, rx: Date.now(), v: p.v };
    toast("📍 Nuevo punto de encuentro de " + estado.encuentro.por);
    pedirRender();
  }
  function alRecibirPausa(p) {
    if (!p || !idValido(p.id)) return;
    const a = estado.amigos.get(p.id);
    if (a) { a.pausado = p.pausado === true; pedirRender(); }
  }

  // ---------- dibujar ----------
  function pedirRender() {
    if (renderPendiente) return;
    renderPendiente = true;
    requestAnimationFrame(() => { renderPendiente = false; render(); });
  }

  function tarjetaDe(clave, esPunto) {
    let t = tarjetas.get(clave);
    if (t) return t;
    const root = el.tpl.content.firstElementChild.cloneNode(true);
    t = {
      root,
      flecha: root.querySelector(".flecha"),
      nombre: root.querySelector(".nombre"),
      distancia: root.querySelector(".distancia"),
      detalle: root.querySelector(".detalle"),
      quitar: root.querySelector(".quitar"),
      rot: 0,
    };
    root.setAttribute("role", "group");
    if (esPunto) {
      root.classList.add("punto");
      root.style.order = "99";
      t.quitar.hidden = false;
      t.quitar.addEventListener("click", quitarPunto);
    }
    el.lista.appendChild(root);
    tarjetas.set(clave, t);
    return t;
  }
  function quitarTarjeta(clave) {
    const t = tarjetas.get(clave);
    if (t) { t.root.remove(); tarjetas.delete(clave); }
  }
  function girar(t, objetivo) {
    t.rot += G.angleDiff(G.normalizeAngle(t.rot), objetivo); // gira por el camino corto, sin dar vueltas raras
    t.flecha.style.transform = "rotate(" + t.rot.toFixed(1) + "deg)";
  }

  // obj: { nombre, color, lat, lon, acc, rx, pausado, extra }
  function pintarTarjeta(t, obj) {
    const edad = (Date.now() - obj.rx) / 1000;
    const vieja = edad > CADUCA_S;
    t.nombre.textContent = obj.nombre;
    t.root.style.setProperty("--color", obj.color);
    t.root.classList.toggle("vieja", vieja);

    if (!estado.pos) {
      t.root.classList.remove("cerca");
      t.distancia.textContent = "—";
      t.detalle.textContent = estado.gps === "denegado" ? "Activa tu ubicación" : "Buscando tu GPS…";
      return;
    }
    const d = G.distanceMeters(estado.pos.lat, estado.pos.lon, obj.lat, obj.lon);
    const hacia = G.bearingDegrees(estado.pos.lat, estado.pos.lon, obj.lat, obj.lon);
    const umbral = Math.min(CERCA_MAX_M, Math.max(CERCA_MIN_M, (estado.pos.acc || 0) + (obj.acc || 0)));
    const cerca = d < umbral && !vieja;
    const rumbo = rumboActual();

    if (rumbo == null) {
      t.root.dataset.modo = "norte"; // sin brújula: la flecha se dibuja con el norte hacia arriba
      girar(t, hacia);
    } else {
      t.root.dataset.modo = "frente";
      girar(t, G.arrowRotation(hacia, rumbo));
    }
    t.root.classList.toggle("cerca", cerca);

    t.distancia.textContent = cerca ? "¡Muy cerca!" : G.formatDistance(d);
    const partes = [];
    if (obj.pausado) partes.push("compartir en pausa");
    if (obj.extra) partes.push(obj.extra);
    partes.push("±" + Math.round(obj.acc || 0) + " m");
    partes.push(vieja ? "última vez " + G.formatAge(edad) : G.formatAge(edad));
    if (rumbo == null) partes.push("norte arriba");
    t.detalle.textContent = partes.join(" · ");
    t.root.setAttribute("aria-label", obj.nombre + ": " + t.distancia.textContent + ", " + t.detalle.textContent);
  }

  function render() {
    const vistos = new Set();
    for (const a of estado.amigos.values()) {
      const clave = "a:" + a.id;
      vistos.add(clave);
      pintarTarjeta(tarjetaDe(clave, false), a);
    }
    if (estado.encuentro) {
      const e = estado.encuentro;
      vistos.add("punto");
      pintarTarjeta(tarjetaDe("punto", true), {
        nombre: "📍 Punto de encuentro",
        color: "#ffffff",
        lat: e.lat,
        lon: e.lon,
        acc: 0,
        rx: Date.now(), // un punto fijo no "envejece"
        extra: "marcado por " + e.por,
      });
    }
    for (const clave of [...tarjetas.keys()]) if (!vistos.has(clave)) quitarTarjeta(clave);
    el.vacio.hidden = tarjetas.size > 0;
    el.miEstado.textContent = textoMiEstado();
  }

  function textoMiEstado() {
    const p = [];
    if (estado.gps === "ok" && estado.pos) {
      const edad = (Date.now() - estado.pos.t) / 1000;
      p.push("Tu GPS: ±" + Math.round(estado.pos.acc || 0) + " m" + (edad > 20 ? " (hace " + Math.round(edad) + " s)" : ""));
    } else if (estado.gps === "buscando") p.push("Buscando GPS…");
    else if (estado.gps === "denegado") p.push("GPS bloqueado");
    if (estado.brujula === "ok") p.push("brújula ok");
    else if (rumboActual() != null) p.push("rumbo por GPS al caminar");
    else if (estado.brujula === "esperando") p.push("brújula sin datos: mueve el móvil dibujando un 8");
    else if (estado.brujula === "sinsensor") p.push("este aparato no tiene brújula");
    else if (estado.brujula === "denegada") p.push("brújula bloqueada");
    if (!estado.compartir) p.push("compartir en pausa");
    if (estado.ahorro) p.push("modo ahorro");
    return p.join(" · ");
  }

  function actualizarBanner() {
    let msg = null;
    if (estado.gps === "denegado") {
      msg = "La ubicación está bloqueada. Permítela para este sitio en los ajustes del navegador y toca el botón.";
    } else if (estado.brujula === "denegada") {
      msg = "La brújula está bloqueada. Toca el botón y acepta el permiso (en iPhone puede hacer falta cerrar Safari del todo y volver a abrir la página).";
    } else if (estado.gps === "apagado" || estado.brujula === "apagada") {
      msg = "Activa la ubicación y la brújula para ver las flechas.";
    }
    el.banner.hidden = msg == null;
    if (msg) el.bannerTxt.textContent = msg;
  }

  // ---------- acciones de los botones ----------
  function activarSensores() {
    // Orden importante en iPhone: primero la brújula, directamente dentro del toque.
    const p = pedirBrujula();
    iniciarGPS();
    actualizarBanner();
    p.then(() => { actualizarBanner(); pedirRender(); });
  }

  function urlSala() {
    return location.origin + location.pathname + "#sala=" + estado.sala;
  }
  async function invitar() {
    const url = urlSala();
    const texto = estado.yo.nombre + " te invita a encontrarse en el festival 🎶";
    if (navigator.share) {
      try { await navigator.share({ title: "Kavendish Finder", text: texto, url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    if (await copiar(url)) toast("Enlace copiado. Pégalo en el chat.");
    else window.prompt("Copia este enlace y envíalo a tus amigos:", url);
  }
  async function enviarMiUbicacion() {
    if (!estado.pos) { toast("Aún no tengo tu GPS."); return; }
    const { lat, lon, acc } = estado.pos;
    const texto = "Estoy aquí (±" + Math.round(acc) + " m): https://maps.google.com/?q=" + lat.toFixed(6) + "," + lon.toFixed(6);
    if (navigator.share) {
      try { await navigator.share({ text: texto }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  }
  function marcarPunto() {
    if (!estado.pos) { toast("Aún no tengo tu GPS."); return; }
    const v = Date.now();
    estado.encuentro = { por: estado.yo.nombre, lat: estado.pos.lat, lon: estado.pos.lon, rx: v, v };
    enviar("meet", { por: estado.yo.nombre, lat: r6(estado.pos.lat), lon: r6(estado.pos.lon), v });
    toast("Punto de encuentro marcado donde estás.");
    pedirRender();
  }
  function quitarPunto() {
    estado.encuentro = null;
    enviar("meet_clear", {});
    pedirRender();
  }
  function alternarAhorro() {
    estado.ahorro = !estado.ahorro;
    el.btnAhorro.setAttribute("aria-pressed", String(estado.ahorro));
    reiniciarTemporizadorEnvio();
    if (estado.ahorro) {
      soltarPantalla();
      toast("Modo ahorro: envío cada 15 s y la pantalla puede apagarse (apagada, no compartes).");
    } else {
      pedirPantallaEncendida();
    }
    pedirRender();
  }
  function alternarPausa() {
    estado.compartir = !estado.compartir;
    el.btnPausa.setAttribute("aria-pressed", String(!estado.compartir));
    enviar("pause", { id: estado.yo.id, pausado: !estado.compartir });
    if (estado.compartir) enviarPos();
    toast(estado.compartir ? "Vuelves a compartir tu posición." : "Dejas de compartir tu posición.");
    pedirRender();
  }
  function salir() {
    const ch = estado.canal;
    if (ch && estado.conexion === "ok") enviar("bye", { id: estado.yo.id });
    setTimeout(() => { if (supa && ch) supa.removeChannel(ch); }, 300);
    estado.canal = null;
    clearInterval(temporizadorEnvio);
    detenerGPS();
    apagarBrujula();
    soltarPantalla();
    if (DEMO) { location.href = location.pathname; return; }
    history.replaceState(null, "", location.pathname + location.search);
    estado.sala = null;
    estado.pos = null;
    estado.amigos.clear();
    estado.encuentro = null;
    estado.gps = "apagado";
    estado.compartir = true;
    estado.ahorro = false;
    el.btnPausa.setAttribute("aria-pressed", "false");
    el.btnAhorro.setAttribute("aria-pressed", "false");
    for (const k of [...tarjetas.keys()]) quitarTarjeta(k);
    prepararInicio();
    mostrar(el.inicio);
  }

  // ---------- pantallas ----------
  function mostrar(pantalla) {
    el.inicio.hidden = pantalla !== el.inicio;
    el.sala.hidden = pantalla !== el.sala;
    window.scrollTo(0, 0);
  }

  function prepararInicio() {
    const codigoEnlace = codigoDeTexto(location.hash);
    el.btnEntrar.textContent = codigoEnlace ? "Unirme a la sala" : "Crear sala nueva";
    el.avisoSala.hidden = !codigoEnlace;
    el.avisoSala.textContent = codigoEnlace ? "Te invitaron a una sala. Escribe tu nombre y entra." : "";
    el.detalleCodigo.hidden = !!codigoEnlace;
    el.codigo.value = "";
  }

  function entrarEnSala(codigo) {
    estado.sala = codigo;
    history.replaceState(null, "", "#sala=" + codigo);
    el.salaCodigo.textContent = codigo;
    activarSensores(); // sigue dentro del toque del usuario
    mostrar(el.sala);
    unirseCanal();
    reiniciarTemporizadorEnvio();
    pedirPantallaEncendida();
    render();
  }

  // ---------- modo demostración (sin internet, GPS ni brújula) ----------
  function iniciarDemo() {
    const BASE = { lat: 4.6097, lon: -74.0817 };
    const mover = (norte, este) => ({
      lat: BASE.lat + norte / 111320,
      lon: BASE.lon + este / (111320 * Math.cos((BASE.lat * Math.PI) / 180)),
    });
    estado.yo = { id: "demo0yo0", nombre: "Tú" };
    estado.sala = "demo";
    estado.gps = "ok";
    estado.brujula = "ok";
    estado.pos = { lat: BASE.lat, lon: BASE.lon, acc: 6, t: Date.now() };
    el.salaCodigo.textContent = "DEMO";
    mostrar(el.sala);
    setConexion("ok");
    actualizarBanner();
    const t0 = Date.now();
    const poner = (id, nombre, color, p, acc, rx) =>
      estado.amigos.set(id, { id, nombre, color, lat: p.lat, lon: p.lon, acc, rx, pausado: false });
    estado.encuentro = { por: "Ana", ...mover(120, 160), rx: t0, v: t0 };

    setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      const ahora = Date.now();
      estado.pos.t = ahora;
      poner("demoana1", "Ana", PALETA[1], mover(60 * Math.cos(t / 20), 60 * Math.sin(t / 20)), 7, ahora);
      poner("democaro", "Caro", PALETA[0], mover(6, 5), 5, ahora);
      // Beto deja de enviar a los 40 s: se ve cómo la tarjeta pasa a "vieja".
      const bt = Math.min(t, 40);
      poner("demobeto", "Beto", PALETA[2], mover(-220 + bt * 2, 150), 9, t0 + 40000);
      pedirRender();
    }, 1000);
    setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      estado.rumbo = G.normalizeAngle(40 + 55 * Math.sin(t / 4));
      estado.ultimoRumbo = Date.now();
      pedirRender();
    }, 80);
  }

  // ---------- arranque ----------
  function iniciar() {
    // Identidad guardada en este teléfono (si el navegador lo permite).
    let id = leer("kv_id");
    if (!id || !/^[a-z0-9]{6,32}$/.test(id)) { id = aleatorio(12); guardar("kv_id", id); }
    estado.yo.id = id;
    el.nombre.value = leer("kv_nombre") || "";

    el.btnActivar.addEventListener("click", activarSensores);
    el.btnInvitar.addEventListener("click", invitar);
    el.btnPunto.addEventListener("click", marcarPunto);
    el.btnEnviar.addEventListener("click", enviarMiUbicacion);
    el.btnAhorro.addEventListener("click", alternarAhorro);
    el.btnPausa.addEventListener("click", alternarPausa);
    el.btnSalir.addEventListener("click", salir);

    el.form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const nombre = nombreLimpio(el.nombre.value);
      if (!el.nombre.value.trim()) { el.nombre.focus(); return; }
      estado.yo.nombre = nombre;
      guardar("kv_nombre", nombre);
      const codigo = codigoDeTexto(el.codigo.value) || codigoDeTexto(location.hash) || aleatorio(10);
      entrarEnSala(codigo);
    });

    document.addEventListener("visibilitychange", () => {
      if (!estado.sala) return;
      if (document.visibilityState === "hidden") { ocultoDesde = Date.now(); return; }
      pedirPantallaEncendida();
      if (!DEMO && Date.now() - ocultoDesde > 20000) unirseCanal(); // el WebSocket pudo morir en segundo plano
      pedirRender();
    });
    window.addEventListener("online", () => { if (estado.sala && !DEMO) unirseCanal(); });
    window.addEventListener("offline", () => { if (estado.sala && !DEMO) setConexion("error"); });
    setInterval(() => { if (estado.sala) render(); }, 1000); // refresca "hace X s"

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    if (DEMO) { iniciarDemo(); return; }

    const hayConfig = CFG.supabaseUrl && CFG.supabaseKey && window.supabase;
    if (hayConfig) {
      supa = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
        realtime: { params: { eventsPerSecond: 10 } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    } else {
      el.avisoConfig.hidden = false;
      el.avisoConfig.textContent = "Falta configurar el servidor (config.js). Mientras tanto puedes probar el modo demostración.";
      el.btnEntrar.disabled = true;
    }
    prepararInicio();
    mostrar(el.inicio);
  }

  iniciar();
})();
