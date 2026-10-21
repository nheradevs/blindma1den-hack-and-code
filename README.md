# Blindma1den Hack&Code

Sitio web y prototipo de plataforma para Blindma1den Hack&Code, un proyecto de
OWASP: entrenamiento de ciberseguridad con escenarios reales, de junior a senior,
para individuos (B2C) y equipos (B2B).

Hecho con **HTML, CSS y JavaScript puro, sin frameworks ni paso de build**. Se
sube tal cual y se despliega como sitio estático.

- **Idiomas:** inglés (principal) y español, con selector EN/ES.
- **Parte informativa** (landing y páginas del menú): responsive, pensada
  primero para móvil.
- **Plataforma** (todo lo que hay bajo `/app/`, después del login): responsive
  para navegar, pero los laboratorios y el terminal son **solo escritorio**
  (≥ 1024 px). Es un prototipo con datos de ejemplo; todavía no hay backend.

---

## 1. Cómo verlo en local

No necesita build. Pero **no lo abras con doble clic** (`file://`): con ese
método el navegador bloquea las fuentes propias y los íconos. Levanta un
servidor estático simple:

```bash
cd blindma1den-site
python3 -m http.server 8080
# abre http://localhost:8080
```

Cualquier servidor estático sirve (`npx serve`, la extensión Live Server de
VS Code, etc.).

---

## 2. Despliegue en Netlify

1. Sube la carpeta `blindma1den-site/` a un repositorio de GitHub (puede ser la
   raíz del repo).
2. En Netlify: **New site from Git** → elige el repo.
3. **Build command:** vacío. **Publish directory:** la carpeta que contiene
   `index.html` (`.` si el sitio está en la raíz del repo).

El archivo `netlify.toml` ya configura el publish directory y las cabeceras de
seguridad. No hay nada que compilar.

### Antes de publicar — lista de pendientes

Busca y reemplaza en todo el proyecto:

- **`YOUR-DOMAIN`** → tu dominio real. Aparece en `robots.txt`, `sitemap.xml` y
  `.well-known/security.txt`.
- **`[DOMAIN]`** → tu dominio, en los textos de las páginas legales y de
  seguridad (en inglés y en español, dentro de `js/i18n.js`).
- **Enlaces de `about.html`:** el de OWASP apunta a la página general de
  proyectos y el de GitHub a `github.com`. Cámbialos por los reales.
- **`.well-known/security.txt`:** tiene una fecha `Expires` (7 oct 2027).
  Renuévala antes de que caduque o los validadores la marcan como inválida.
- **Contenido entre corchetes** (`[PRICE TBD]`, `[EVENT NAME]`, `[POST TITLE]`,
  `[N]`, etc.): son marcadores a reemplazar con contenido real. En el código
  llevan la clase `tbd` para que sean fáciles de encontrar (`grep -r "tbd"` o
  `grep -rn "\["`).

### Después de publicar

- Netlify detecta solo los formularios (ver §6). Revisa que aparezcan en
  **Site → Forms**.
- Verifica las cabeceras de seguridad en https://securityheaders.com.
- Verifica `tudominio/.well-known/security.txt`.

---

## 3. Estructura del proyecto

```
blindma1den-site/
├── index.html              Home (landing)
├── intelligence.html       Cómo funciona la plataforma
├── gauntlet.html           Especialidades + rutas de aprendizaje
├── ctf.html                Competencias CTF
├── briefing.html           Blog / write-ups / análisis de incidentes
├── operations.html         Oferta para empresas (B2B)
├── about.html              Manifiesto, OWASP, equipo, cómo contribuir
├── contact.html            Formulario de contacto (enruta por tipo)
├── resources.html          Recursos de OWASP y referencias
├── disclosure.html         Política de divulgación de vulnerabilidades
├── security.html           Security Whitepaper (borrador)
├── privacy.html            Política de privacidad (borrador legal)
├── terms.html              Términos del servicio (borrador legal)
├── cookies.html            Política de cookies (borrador legal)
├── post.html               Plantilla de artículo para Briefing (noindex)
├── login.html              Access — inicia sesión  (switch Access/Enlist)
├── signup.html             Enlist — registro       (misma página, otro panel)
├── reset.html              Paso 1: pedir el enlace de restablecimiento (noindex)
├── reset-password.html     Paso 2: elegir la contraseña nueva (noindex)
├── thanks.html             Página de gracias tras enviar formularios (noindex)
├── 404.html                Página de error
│
├── server/                 Backend de auth (Node, sin dependencias)
│   ├── index.mjs           Sitio + API en el mismo origen (dev)
│   └── core/               handlers, crypto, store, mailer
├── netlify/functions/      Función de Netlify (mismo código que server/)
├── tests/                  Tests del backend con node:test
├── package.json            Scripts y la única dependencia (@netlify/blobs)
│
├── app/                    PLATAFORMA (tras el login) — toda noindex
│   ├── index.html          Panel de inicio
│   ├── terminal.html       Attack box
│   ├── vectors.html        Mapa de habilidades
│   ├── gauntlet.html       Catálogo de especialidades
│   ├── track-*.html        Una ruta (árbol de misiones) por especialidad (×10)
│   ├── mission-*.html      Una misión de ejemplo por especialidad (×10)
│   ├── arenas.html         Lista de Live Arenas
│   ├── arena.html          Detalle de una Live Arena
│   ├── briefings.html      Intel Briefings dentro de la plataforma
│   ├── leaderboard.html    Clasificación
│   ├── inventory.html      Guardados, insignias, certificados
│   ├── squad.html          Custom Arena (B2B dentro de la plataforma)
│   ├── settings.html       Perfil, seguridad/MFA, plan, privacidad
│   └── search.html         Resultados de búsqueda
│
├── css/
│   ├── styles.css          Estilos del sitio público (tokens, tipografía, etc.)
│   └── app.css             Estilos de la plataforma (se carga después)
│
├── js/
│   ├── i18n.js             Traducciones ES del sitio público (inglés va en el HTML)
│   ├── i18n-app.js         Traducciones ES de la plataforma
│   ├── main.js             Idioma, menú móvil, evitar palabras huérfanas
│   ├── auth.js             Login/registro/reset + switch Access/Enlist
│   ├── reset-boot.js       Saca el token de reset de la URL antes que nada
│   ├── contact.js          Preselección de tema en el formulario de contacto
│   ├── filter.js           Filtro por chips (The Gauntlet, Briefing)
│   └── app.js              Lógica de la plataforma (menú, pestañas, laboratorio…)
│
├── assets/
│   ├── img/logo.png        Logo
│   ├── favicon.svg
│   ├── icons.svg           Sprite de íconos (SVG, dibujados para el proyecto)
│   └── fonts/              Inter y Space Grotesk (servidas desde el propio dominio)
│
├── .well-known/
│   └── security.txt        Contacto de seguridad (RFC 9116)
├── robots.txt
├── sitemap.xml
└── netlify.toml            Publish dir + cabeceras de seguridad y caché
```

Las páginas comparten el mismo header y footer, **copiados** en cada archivo.
Sin framework es lo más simple y funciona aunque el navegador no ejecute
JavaScript. Si cambias el header o el footer, hay que cambiarlo en todas las
páginas.

---

## 4. Decisiones de UX/UI y por qué

### Mobile-first y responsive
La parte informativa se diseñó primero para móvil y crece hacia escritorio.
Mucha gente llega desde el celular (un enlace, redes); si ahí se ve roto, no
vuelve.

### La plataforma deja entrar desde cualquier dispositivo
Se puede navegar el panel, ver progreso y el catálogo desde el móvil, pero el
**laboratorio y el terminal son solo escritorio**. En pantallas pequeñas, en
lugar de un error, aparece una pantalla con el tono de la marca y dos acciones
útiles: guardar la misión para escritorio o recibir el enlace por correo. Así
la persona ve qué hay dentro y vuelve desde la computadora, en vez de toparse
con una puerta cerrada. El bloqueo se decide por **tamaño de pantalla, no por
tipo de dispositivo**, para que una tablet grande con teclado también sirva.

### Jerarquía de títulos y escala tipográfica
Cada página tiene **un solo `<h1>`** y los niveles no se saltan (`h1 → h2 → h3`),
que es como los lectores de pantalla y Google entienden la estructura. Los
tamaños salen de una escala fija (ver el comentario al inicio de `css/styles.css`):
un `h1` siempre es mayor que un `h2`, y este mayor que un `h3`. Así todo el
sitio se ve coherente y nadie inventa tamaños nuevos.

### Sin palabras huérfanas
Una sola palabra sola en la última línea de un título o párrafo se ve mal.
`main.js` une las dos últimas palabras con un espacio irrompible, y el CSS usa
`text-wrap: balance`/`pretty`. Está limitado para que en móviles pequeños los
títulos no se desborden.

### Copywriting: fórmula PAS + tono
El copy usa **PAS (Problema, Agitación, Solución)**, que es donde mejor encaja
el sarcasmo de la marca. Regla de tono: el sarcasmo apunta a la industria y a
las plataformas "de burbuja", **nunca al usuario**. Al usuario se le reta, no
se le humilla; esa diferencia separa lo cercano de lo arrogante.

### Nombres de marca sin traducir
Las secciones (The Gauntlet, Live Arenas, Intel Briefings, Custom Arena,
Terminal, Vectors) se quedan en inglés en los dos idiomas, como nombres propios.
Traducir solo la mitad se veía inconsistente.

---

## 5. Buenas prácticas de código y por qué

### HTML semántico y accesible (WCAG 2.1 AA)
- Se usan elementos reales: `<button>`, `<a href>`, `<input>`+`<label>`,
  `<nav>`, `<main>`, `<table>`. Nunca un `div` con `onclick` (el teclado lo
  salta). Esto da navegación por teclado y compatibilidad con lectores de
  pantalla **gratis**.
- Hay un enlace "saltar al contenido", foco visible, y áreas táctiles de al
  menos 44×44 px.
- **Contraste:** el morado y el azul del diseño original no cumplían el mínimo
  AA sobre fondo oscuro; se aclararon sin cambiar la estética. Los colores que
  deben distinguirse también difieren en claridad, no solo en tono (por eso se
  prefiere azul/naranja a rojo/verde: sirve para daltónicos).
- Los íconos decorativos llevan `aria-hidden`; los botones de solo ícono llevan
  `aria-label`.

### Internacionalización (i18n)
- El **inglés vive en el HTML** (bueno para SEO y funciona sin JavaScript).
- El **español vive en `js/i18n*.js`**, indexado por el atributo `data-i18n`.
- El idioma se elige en este orden: parámetro `?lang=es` en la URL → última
  elección guardada → idioma del navegador.
- **Para traducir algo nuevo:** ponle `data-i18n="clave"` al elemento (o
  `data-i18n-attr="atributo:clave"` para traducir un atributo) y añade esa
  clave al archivo de idioma. Las claves del sitio público van en `i18n.js`;
  las de la plataforma, en `i18n-app.js`.

### Sin dependencias ni build
Nada de npm, bundlers ni frameworks. Menos cosas que puedan romperse o quedar
desactualizadas, cero superficie de ataque por dependencias, y cualquiera del
equipo puede abrir un archivo y entenderlo. Es un proyecto de seguridad: menos
es más.

### Mejora progresiva
Las cosas funcionan sin JavaScript y mejoran con él. Ejemplos: los formularios
hacen POST normal; el switch Access/Enlist son dos páginas reales; los filtros
muestran todo si no hay JS. Si el JS falla, el sitio sigue usable.

### Fuentes servidas desde el propio dominio
Inter y Space Grotesk están en `assets/fonts/` en vez de cargarse desde Google
Fonts. Así no se le pasa la IP de cada visitante a un tercero, la política de
cookies puede decir con verdad que no hay terceros, y la página carga más
rápido. Licencia SIL OFL (ver los `LICENSE-*.txt` en esa carpeta).

### Sin almacenamiento de datos sensibles en el navegador
`localStorage` se usa solo para comodidades por usuario (idioma, si el menú
está contraído, notas de misión), siempre envuelto en `try/catch`. Nada
sensible. Las notas de misión avisan de que son solo locales.

---

## 6. Seguridad (es un proyecto de OWASP, así que importa)

### Cabeceras HTTP (`netlify.toml`)
- **Content-Security-Policy** estricta: scripts y estilos solo del propio
  dominio, nada de terceros, `object-src 'none'`, `frame-ancestors 'none'`.
  Por esto no hay estilos ni scripts "en línea" sueltos: todo va en archivos.
- **HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  Permissions-Policy, Cross-Origin-Opener-Policy.**
- La plataforma (`/app/*`) va con `noindex` y `no-store`.

### Login y registro (`js/auth.js`)
El frontend ya sigue las recomendaciones de OWASP / NIST SP 800-63B. **Pero el
frontend no puede imponer seguridad: solo ayuda al usuario.** Lo que de verdad
protege es el backend, que todavía no existe.

**El contrato del backend está documentado al inicio de `js/auth.js`.** Lo
esencial:
- Contraseñas de 12 a 128 caracteres, cualquier símbolo y espacios, sin reglas
  de composición; se rechazan las filtradas (listas tipo Have I Been Pwned).
- Guardar con **Argon2id** (o bcrypt/scrypt), nunca cifrado reversible.
- Respuestas que **no revelan si un correo existe** (mismo mensaje y tiempos
  parecidos siempre).
- Limitar intentos sin bloquear cuentas (bloquearlas permite dejar fuera a
  usuarios legítimos).
- Cookies de sesión `HttpOnly` + `Secure` + `SameSite`, rotadas al entrar, y
  protección CSRF.
- Enlaces mágicos y de restablecimiento de un solo uso y con caducidad corta.
- Ofrecer MFA (TOTP / passkeys) dentro de la plataforma.

**Detección automática, no una bandera:** `auth.js` pregunta una sola vez a
`GET /api/health`. Si contesta, los formularios hablan con el backend real; si
no (sitio estático abierto con `python3 -m http.server`, o deploy sin la
función), todo sigue en modo demo: los formularios validan en el navegador,
Access y Enlist dejan entrar al prototipo y los enlaces muestran el aviso de
"modo demo" porque no hay correo que mandar. Nunca hay que cambiar una
constante para pasar de un mundo al otro.

### Recuperar contraseña (`reset.html` → `reset-password.html`)
El flujo son dos pasos, como recomienda la
[cheat sheet de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html):
pedir el enlace y después elegir la contraseña nueva, con el token como prueba
de identidad.

**Paso 1 — `reset.html`.** El usuario escribe su correo y el servidor contesta
siempre lo mismo, exista o no la cuenta. En el navegador:
- mismo mensaje para todos los casos (`auth.ok.reset`);
- límite de reenvío de 60 s por pestaña, con cuenta atrás en el botón;
- un `429` muestra un aviso propio (`reset.rate`), no el mensaje de éxito;
- slot de captcha para cuando el servidor lo pida;
- sin bloqueo de cuenta: bloquearla convierte el formulario en un ataque de
denegación de servicio contra usuarios conocidos.

**Paso 2 — `reset-password.html`.** Tres estados excluyentes, sin recargar:

| Estado | Cuándo | Qué se ve |
| --- | --- | --- |
| Formulario | Hay token | Contraseña nueva + repetición, medidor de fuerza, Caps Lock, toggle de ver |
| Listo | El servidor aceptó el cambio | Confirmación, aviso de correo enviado, sesiones cerradas y botón a Access |
| Enlace muerto | Token ausente, vencido o ya usado | Mensaje genérico (“este enlace ya no funciona”) y botón para pedir otro |

Reglas que se sostienen en todos los estados:
- la contraseña se escribe dos veces y sigue la misma política que el registro
(12–128, espacios y símbolos, sin reglas de composición);
- **no hay auto-login**: después del cambio se vuelve a Access;
- nunca se dice si el enlace era de otro usuario, si venció o si ya se usó;
- el token **se saca de la barra de direcciones** al cargar, antes de que corra
cualquier otro script (`js/reset-boot.js`, sincrónico en el `<head>`), y queda
en `sessionStorage`; las rutas de reset van con `Referrer-Policy: no-referrer`
y `Cache-Control: no-store`;
- sin preguntas de seguridad en ningún paso.

**Demo:** si no hay backend contestando `/api/health`, el paso 2 muestra el
estado “listo” con el aviso de modo demo, para poder revisar el diseño, y nunca
afirma que un cambio real haya ocurrido.

**En el servidor falta** (está documentado al inicio de `js/auth.js`): token de
32 bytes de un CSPRNG guardado como hash, ligado al usuario, de un solo uso y
con vencimiento de 30 minutos; `POST /api/auth/reset/confirm`; correo de aviso
del cambio; invalidación de todas las sesiones y de los demás tokens pendientes;
límite de intentos también sobre el token. El enlace del correo debería ir a
`/reset-password#token=…` (el fragmento no llega al servidor ni a los logs) o,
mejor todavía, a un `POST /api/auth/reset/verify` que cambie el token por una
cookie de sesión de reset de corta vida y redirija a una URL limpia.

### Backend de autenticación (local y Netlify)
`server/` responde `/api/auth/*` con el mismo código que corre como función en
Netlify, así que lo que probás en tu máquina es lo que se despliega. Sin
frameworks y sin dependencias nuevas: `node:crypto` hace scrypt y los tokens,
un archivo JSON hace de base de datos local y Netlify Blobs la de producción.

| Archivo | Qué hace |
| --- | --- |
| `server/index.mjs` | Sirve el sitio **y** la API en el mismo origen, con las mismas cabeceras que `netlify.toml` |
| `server/core/handlers.mjs` | Registro, login, reset, confirm: las reglas de seguridad viven acá |
| `server/core/crypto.mjs` | scrypt para contraseñas, tokens aleatorios de 32 bytes, guardados como hash |
| `server/core/store.mjs` | Almacenamiento: JSON local o Netlify Blobs |
| `server/core/mailer.mjs` | Correos: a un log local, o a Resend en producción |
| `netlify/functions/auth.mjs` | Adaptador de la función; el redirect mantiene `/api/auth/*` en el mismo origen |
| `tests/` | 16 casos con `node:test`, sin dependencias |

**En local:**

```bash
node server/index.mjs        # http://localhost:8080 (sitio + API)
npm test                     # 16 casos: enumeración, token de un solo uso,
                             # vencimiento, rate limit, login y hashing
```

Los correos quedan en `server/.data/mail.log` y también en la consola: abrís el
link de ahí y seguís el flujo completo sin proveedor. La base local es
`server/.data/db.json` (ignorada por git).

**En Netlify** (el sitio sigue sin build; solo se despliega la función):

| Variable | Valor |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://tu-sitio.netlify.app` — el link del correo se arma con esto, nunca con el header `Host` |
| `MAIL_MODE` | `resend` |
| `RESEND_API_KEY` | la del panel de Resend |
| `MAIL_FROM` | remitente verificado, p. ej. `Blindma1den <no-reply@tudominio.com>` |
| `AUTH_STORE` | `blobs` (ya es el valor por defecto en la función) |

Opcionales: `AUTH_TOKEN_TTL_SECONDS` (30 min), `AUTH_RATE_RESET_MAX`,
`AUTH_RATE_ACCOUNT_MAX`, `AUTH_RATE_CONFIRM_MAX`, `AUTH_RATE_WINDOW_SECONDS`.

**Implementado:** registro sin enumeración, login con cookie `HttpOnly`,
reset de un solo uso con token hasheado, vencimiento, invalidación del token
anterior y de todas las sesiones, límites por IP y por cuenta sin bloquear la
cuenta, correo de aviso al cambiar la contraseña, y tests que lo cubren.

**Pendiente (documentado, no simulado):**
- **Magic link**: el endpoint responde genérico pero no envía nada.
- **`/app/*` sigue siendo estático y sin protección en el servidor.**
- **Resend en modo test** solo entrega a tu propio correo hasta que verifiques
  un dominio; para que el equipo reciba links, verificá el dominio.
- **Rate limit en Blobs**: leer-y-escribir no es atómico. El límite real en
  producción son las reglas de tráfico de Netlify.
- **Tiempos**: la respuesta es la misma para cuenta existente e inexistente,
  pero el envío del correo mete una diferencia. La solución es encolar el
  envío; acá el envío se espera y está anotado.

### La plataforma debe protegerse en el servidor
Las páginas de `/app/` son un prototipo estático. En producción, **cada una
debe servirse solo después de que el servidor verifique la sesión.** Nunca
confíes en JavaScript para proteger contenido privado.

### Formularios (Netlify Forms)
Los formularios de contacto, newsletter y Operations usan Netlify Forms (sin
backend propio) y tienen un campo trampa ("honeypot") contra bots. El de
login/registro **no** usa Netlify Forms: las contraseñas nunca deben pasar por
un servicio de formularios.

### Divulgación de vulnerabilidades
`disclosure.html` + `.well-known/security.txt` dan un canal de reporte, tiempos
de respuesta y una cláusula de "safe harbor" (no tomar acciones legales contra
quien reporte de buena fe). Para un proyecto de OWASP es casi obligatorio.

### Captcha (recomendación)
El login muestra un captcha solo cuando el servidor lo pide (p. ej. tras varios
intentos fallidos), para no poner fricción al usuario normal. **Recomendación:**
usar Cloudflare Turnstile en vez de reCAPTCHA. reCAPTCHA manda datos a Google y
contradice la política de cookies/CSP de este sitio. Si lo agregas, acuérdate
de permitir su dominio en la CSP.

---

## 7. Estado actual y qué falta

**Hecho:** todo el sitio informativo, login/registro/reset, y el prototipo
completo de la plataforma (32 pantallas), responsive y en dos idiomas.

**Marcadores de posición** (busca `tbd` y `[corchetes]`): precios de los planes,
eventos de CTF, artículos de Briefing, nombres de misión reales, el logo/insignia
de OWASP, fotos del equipo, y las respuestas "por definir" en varias páginas.

**Pendiente de contenido legal:** privacy, terms, cookies y el security
whitepaper tienen la estructura y un aviso de borrador; el texto final lo debe
revisar un abogado (las legales) y el equipo de infraestructura (el whitepaper).

**Pendiente de ingeniería:**
- Backend de autenticación (contrato en `js/auth.js`).
- Backend de la plataforma: laboratorios aislados, envío de flags, arenas,
  clasificación, búsqueda. Los puntos de integración están marcados con
  comentarios en `js/app.js`.
- Definir el contenido real de las rutas por especialidad (hoy 9 de 10 usan el
  mismo árbol de 12 misiones de ejemplo que Web App Exploits).

---

## 8. Créditos y licencias

- **Fuentes:** Inter y Space Grotesk, licencia SIL Open Font License 1.1
  (`assets/fonts/LICENSE-*.txt`).
- **Íconos:** SVG dibujados para este proyecto (`assets/icons.svg`).
- **Código:** elige y añade la licencia del proyecto (al ser OWASP, lo habitual
  es una licencia abierta).
