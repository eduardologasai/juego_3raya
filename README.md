# Juego Tres en Raya (Tic-Tac-Toe) con Supabase

Un juego interactivo de Tres en Raya desarrollado con HTML5, CSS3, JavaScript y soporte para base de datos con **Supabase** (PostgreSQL).

## 🚀 Características
- **Modos de Juego:**
  - 👥 2 Jugadores (Local)
  - 🤖 vs IA (Fácil)
  - 🧠 vs IA (Imposible con algoritmo Minimax)
- **Diseño Moderno:** Estética oscura estilo Glassmorphism con efectos de neón y animaciones fluidas.
- **Efectos de Audio:** Sonidos sintetizados en tiempo real mediante `Web Audio API` (sin archivos externos).
- **Integración con Supabase:**
  - ☁️ Guardado en la nube del historial de partidas jugadas.
  - 🏆 Tabla de clasificación global (Leaderboard) en tiempo real con mejores victorias y rachas.
  - 🔄 Funcionamiento híbrido: funciona tanto offline (local) como conectado a la nube.

---

## ☁️ Configuración de Supabase (Opcional)

Si deseas conectar el juego a tu propia base de datos en Supabase:

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Ve al **SQL Editor** en el panel de Supabase.
3. Copia el contenido del archivo [`supabase_schema.sql`](./supabase_schema.sql) y ejecútalo con **Run**.
4. En el panel de Supabase, ve a **Project Settings > API** y copia:
   - **Project URL**
   - **anon public key**
5. Abre el juego (`index.html`), haz clic en el botón de la nube **☁️** (o en el botón superior "Local"), ingresa tus datos y pulsa **Guardar y Conectar**.

---

## 🎮 Cómo ejecutar el juego
Solo haz doble clic en `index.html` en tu navegador favorito. ¡Listo para jugar!
