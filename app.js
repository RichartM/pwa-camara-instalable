/* =========================================================
   Inspección Visual PWA
   Flujo general:
   1. Registrar el Service Worker (requisito para instalar).
   2. Instalación: Android usa beforeinstallprompt; iOS muestra guía manual.
   3. Cámara con pre-permiso: aviso propio -> consentimiento -> getUserMedia().
   Sin async/await: toda la asincronía va con .then/.catch/.finally.
   ========================================================= */

// ---------- Referencias al DOM ----------
const btnInstalar = document.getElementById('btn-instalar');
const btnPreparar = document.getElementById('btn-preparar-camara');
const btnConfirmar = document.getElementById('btn-confirmar-permiso');
const btnCancelar = document.getElementById('btn-cancelar-permiso');
const btnAlternar = document.getElementById('btn-alternar-camara');
const btnApagar = document.getElementById('btn-apagar-camara');
const avisoPermiso = document.getElementById('aviso-permiso');
const visorVideo = document.getElementById('visor-camara');
const visorVacio = document.getElementById('visor-vacio');
const mensajeEstado = document.getElementById('mensaje-estado');

function actualizarMensajeEstado(texto){
  mensajeEstado.textContent = texto;
}

// Habilita/deshabilita controles según si hay cámara encendida
function actualizarControles(camaraActiva){
  btnAlternar.disabled = !camaraActiva;
  btnApagar.disabled = !camaraActiva;
  btnPreparar.hidden = camaraActiva;
  visorVacio.hidden = camaraActiva;
}

/* =========================================================
   1. SERVICE WORKER
   ========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registro) => console.log('[SW] Registrado en:', registro.scope))
      .catch((error) => console.error('[SW] Error al registrar:', error));
  });
}

/* =========================================================
   2. INSTALACIÓN
   ========================================================= */

// --- Android / Chrome: guardamos el evento para lanzarlo con nuestro botón ---
let eventoInstalacionDiferido = null;

window.addEventListener('beforeinstallprompt', (event) => {
  // Evita que el mini-banner automático aparezca antes de tiempo
  event.preventDefault();
  eventoInstalacionDiferido = event;
  // Muestra tu botón personalizado de instalación en la UI
  btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;

  eventoInstalacionDiferido.prompt(); // Abre el diálogo nativo de instalación
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      if (resultado.outcome === 'accepted') {
        btnInstalar.hidden = true;
        actualizarMensajeEstado('Aplicación instalada en tu pantalla de inicio.');
      } else {
        actualizarMensajeEstado('Instalación cancelada.');
      }
    })
    .finally(() => {
      // El evento solo puede usarse una vez
      eventoInstalacionDiferido = null;
    });
});

// Se dispara cuando la instalación termina (por botón o menú del navegador)
window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
  eventoInstalacionDiferido = null;
});

// --- iOS: no existe beforeinstallprompt, mostramos instrucciones manuales ---
function verificarEntornoIOS(){
  // iPadOS moderno se identifica como "Macintosh"; lo detectamos por pantalla táctil
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // ¿Se abrió desde el icono de inicio (standalone) o desde Safari?
  const estaInstalada = window.navigator.standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches;

  if (esIOS && !estaInstalada) {
    document.getElementById('instrucciones-ios').hidden = false;
  }
}

verificarEntornoIOS();

/* =========================================================
   3. CÁMARA
   ========================================================= */
let streamActual = null;
let modoCamaraActual = 'environment'; // 'environment' = trasera | 'user' = frontal

// Libera el sensor: obligatorio antes de cambiar de lente (iOS lanza NotReadableError si no)
function detenerCamaraActiva(){
  if (streamActual) {
    streamActual.getTracks().forEach((track) => {
      track.stop();
    });
    streamActual = null;
  }
}

// Pide el flujo de video con el lente indicado y lo muestra en el <video>
function iniciarCamara(modo){
  detenerCamaraActiva();

  // getUserMedia solo existe en contextos seguros (HTTPS / localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actualizarMensajeEstado('Tu navegador no permite acceder a la cámara (se requiere HTTPS).');
    return Promise.resolve();
  }

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  // Evita doble clic mientras se negocia el hardware
  btnAlternar.disabled = true;
  actualizarMensajeEstado('Solicitando acceso a la cámara...');

  return navigator.mediaDevices.getUserMedia(restricciones)
    .then((stream) => {
      streamActual = stream;
      visorVideo.srcObject = stream;
      // Frontal en espejo para que se vea natural
      visorVideo.classList.toggle('espejo', modo === 'user');
      // iOS a veces no arranca solo con autoplay; forzamos play()
      return visorVideo.play().catch(() => {});
    })
    .then(() => {
      if (!streamActual) return;
      actualizarControles(true);
      actualizarMensajeEstado(`Cámara activa (${modo === 'environment' ? 'Trasera' : 'Frontal'})`);
    })
    .catch((error) => {
      actualizarControles(false);
      if (error.name === 'NotAllowedError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        actualizarMensajeEstado('La cámara está ocupada por otra app. Ciérrala e inténtalo de nuevo.');
      } else {
        actualizarMensajeEstado(`Error al acceder al hardware: ${error.message}`);
      }
    });
}

// --- Pre-permiso (UX ética) ---
// Paso 1: solo mostramos el aviso, todavía NO se pide permiso al navegador
btnPreparar.addEventListener('click', () => {
  avisoPermiso.hidden = false;
  avisoPermiso.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// El usuario puede rechazar sin "quemar" el permiso nativo
btnCancelar.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Acceso a la cámara pospuesto. Puedes solicitarlo cuando quieras.');
});

// Paso 2: consentimiento confirmado -> ahora sí se llama a getUserMedia()
btnConfirmar.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

// --- Alternar lente: invierte el modo y reinicia (iniciarCamara detiene el anterior) ---
btnAlternar.addEventListener('click', () => {
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual);
});

// --- Apagar: libera el hardware y limpia el visor ---
btnApagar.addEventListener('click', () => {
  detenerCamaraActiva();
  visorVideo.srcObject = null;
  actualizarControles(false);
  actualizarMensajeEstado('Cámara apagada.');
});

// Libera la cámara si la app pasa a segundo plano (iOS la congela de todos modos)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && streamActual) {
    detenerCamaraActiva();
    visorVideo.srcObject = null;
    actualizarControles(false);
    actualizarMensajeEstado('Cámara apagada al salir de la app.');
  }
});
