# Kavendish Finder 🧭

Una página web con **flechas que te llevan hasta tus amigos** en un festival o rave.
Funciona en **iPhone y Android**, sin instalar nada: se abre con un enlace.

> No se nada de programacion y estoy aprendiendo en casa como muchos de ustedes.
> Espero poder aprender lo necesario para usar la IA como apoyo en mi profesion.

---

## Cómo se usa (para ti y tus amigos)

1. **Uno de ustedes** abre la página, escribe su nombre y toca **Crear sala nueva**.
2. Toca **Invitar amigos** y manda el enlace por WhatsApp.
3. **Los demás** abren el enlace, escriben su nombre y tocan **Unirme a la sala**.
4. Acepten los permisos de **ubicación** y de **brújula** cuando el teléfono los pida.
5. Verán una tarjeta por amigo con una **flecha**, la **distancia** y hace cuánto se actualizó su posición.
   Gira el cuerpo hasta que la flecha apunte hacia arriba (recto) y camina hacia allá.

Botones útiles:

| Botón | Para qué sirve |
|---|---|
| 📍 Marcar punto de encuentro | Deja una flecha para todos hacia donde estás parado (la carpa, el auto…) |
| Enviar mi ubicación (WhatsApp/SMS) | Plan B: manda tu ubicación como mensaje normal (el SMS pasa cuando los datos no) |
| Modo ahorro | Envía tu posición cada 15 s en vez de 5 s y deja que la pantalla se apague |
| Pausar compartir | Tus amigos dejan de recibir tu posición (verán "compartir en pausa") |
| Salir de la sala | Dejas de compartir y borras el enlace del navegador |

**Probarla sin amigos:** añade `?demo=1` al final de la dirección (o toca "Probar en modo demostración").
Verás amigos simulados que se mueven, uno que está "muy cerca" y otro que deja de enviar (su tarjeta se vuelve gris).

### Lo que tienen que saber (limitaciones honestas)

- **Mantén la pantalla encendida y la página abierta.** Con el teléfono bloqueado o la página en segundo plano,
  el navegador la pausa y tu posición deja de enviarse; tus amigos verán tu *última* posición con su antigüedad ("hace 3 min").
  La app pide que la pantalla no se apague mientras está abierta, y eso gasta batería: lleven batería externa.
- **El GPS no es mágico:** entre multitudes tiene un error típico de 5–10 m. Por eso, a menos de ~15 m la app
  dice **"¡Muy cerca!"** en vez de dibujar una flecha: ahí hay que mirar alrededor.
- **La brújula puede desviarse** cerca de altavoces, estructuras metálicas o imanes. Si la flecha se ve rara,
  mueve el teléfono dibujando un "8" en el aire. Usa el teléfono **en vertical** (como para leer).
  Los teléfonos usan el norte *magnético*; según el país puede haber unos grados de diferencia con el norte real.
- **Se necesita internet** (aunque sea poco) para compartir posiciones. Tu propio GPS y tu brújula funcionan sin datos,
  y la flecha seguirá apuntando a la última posición conocida de cada amigo.
- En **iPhone** funciona mejor abierta en **Safari** que añadida a la pantalla de inicio
  (hay reportes de permisos de ubicación raros en ese modo). Si la usas desde la pantalla de inicio, pruébalo antes.

### Privacidad

- Solo quien tenga **tu enlace de sala** ve tu posición. Trátalo como una llave: no lo publiques en redes.
- El código de sala va después del `#` del enlace, así que ni siquiera se envía a quien aloja la página.
- **No se guarda historial** ni se usa base de datos: los mensajes solo pasan en vivo entre los teléfonos.
- Cuando termine el festival, cada quien toca **Salir de la sala**.

---

## Plan B para llevar al rave (sin depender de esta página)

1. **Punto de encuentro físico + hora fija** (ej.: cada hora en punto, junto a un escenario o baño conocido). Es lo más fiable que existe.
2. **WhatsApp → Ubicación en tiempo real** en el chat del grupo (sirve entre iPhone y Android).
3. **Bitchat** instalado en los tres teléfonos por si se cae internet (mensajes por Bluetooth, sin ubicación ni flechas).
4. Batería externa y brillo bajo.

---

## Antes del festival: prueba de campo ✅

Hagan esto **al menos un día antes**, en un parque, los tres con sus teléfonos reales (mezclando iPhone y Android):

- [ ] Los tres entran a la misma sala y aceptan ubicación + brújula.
- [ ] Aléjense 100–200 m: ¿las flechas apuntan hacia el amigo correcto y la distancia es razonable?
- [ ] Giren el cuerpo: ¿la flecha cambia de forma lógica?
- [ ] Acérquense a menos de 15 m: aparece "¡Muy cerca!".
- [ ] Bloqueen un teléfono 1 minuto: los otros lo ven como "hace 1 min" y al desbloquear se recupera.
- [ ] Apaguen los datos de uno: sigue mostrando la última posición de los otros; al volver, se actualiza.
- [ ] Prueben **Marcar punto de encuentro** y **Enviar mi ubicación**.
- [ ] Midan la batería tras 1 hora de uso.
- [ ] **Abran la página unos días antes del evento**: el servidor gratuito se pausa si pasa una semana sin uso.

---

## Cómo publicarla (una sola vez)

La página es solo archivos; GitHub los puede alojar gratis con **GitHub Pages** (el repositorio debe ser **público**):

1. En GitHub, abre el repositorio → **Settings** → **Pages**.
2. En *Build and deployment*: **Source = Deploy from a branch**.
3. En *Branch* elige la rama donde están estos archivos (hoy `ccr-45f87115-oir1jl`; cuando la pases a `main`, elige `main`) y la carpeta **/ (root)** → **Save**.
4. En uno o dos minutos aparece la dirección: `https://profekavendoish.github.io/Kavendish/`.
   Esa es la que compartes. Los teléfonos exigen **HTTPS** para dar GPS y brújula, y GitHub Pages ya lo trae.

Cuando cambies algo en el código, en un par de minutos se actualiza solo (la app busca primero la versión nueva).

---

## Para quien quiera entender el código

Todo son archivos simples, sin instalar nada ni "compilar":

| Archivo | Qué hace |
|---|---|
| `index.html` | Las dos pantallas (entrar y sala) y la plantilla de cada tarjeta |
| `style.css` | El diseño oscuro pensado para usarse de noche |
| `geo.js` | **Matemáticas**: distancia, rumbo (hacia dónde está el amigo), brújula, formatos. Sin pantalla ni internet, por eso se prueba fácil |
| `geo.test.js` | Pruebas de `geo.js` |
| `app.js` | GPS, brújula, compartir posiciones, dibujar flechas y botones |
| `config.js` | Dirección y clave **pública** del servidor de tiempo real (Supabase) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Para que se pueda "instalar" y abrir aunque no haya señal |
| `vendor/supabase.js` | Librería oficial de Supabase (copiada; ver `vendor/LEEME.txt`) |

**Cómo funciona la flecha:** cada teléfono lee su GPS y su brújula. Cada 5 segundos manda su posición a los demás
(Supabase Realtime, solo mensajes en vivo). Con la posición de ambos se calcula el **rumbo** hacia el amigo
(0° = norte). La flecha gira *rumbo del amigo − hacia dónde apunta tu teléfono*; si es 0°, el amigo está justo delante.

**Probar los cálculos** (requiere Node 18 o más nuevo, no hay que instalar nada):

```bash
node --test geo.test.js
```

**Ver la página en tu computador:**

```bash
python3 -m http.server 8000
# abre http://localhost:8000/index.html?demo=1
```

**Si en la sala siempre dice "Sin conexión":** abre el panel de Supabase del proyecto `kavendish-finder` →
*Realtime* → *Settings* y comprueba que está permitido el acceso público (canales públicos) y que el proyecto no está pausado.

> Las claves de `config.js` son públicas **por diseño** (van en el navegador de cualquiera).
> Nunca pegues ahí una clave "secret" o "service_role".
