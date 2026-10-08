# Lectio

Prototipo editorial para descubrir libros, registrar lecturas, intercambiar ejemplares y conversar en Plaza.

## Desarrollo local

Requisitos: Node.js 24 o posterior y npm.

```powershell
npm ci
npm run start:built
```

Abre `http://localhost:4178`. El servidor sirve el build multipágina y la API en el mismo origen. La base SQLite se crea en `data/lectio.sqlite` y está excluida de Git.

## Publicar el frontend en GitHub Pages

GitHub Pages es un host estático, gratuito y sin vencimiento ni contraseña para un repositorio público. El workflow de `.github/workflows/deploy.yml` compila `dist` y publica las nueve pantallas junto con sus imágenes locales.

1. Instala Git for Windows si `git --version` no funciona en PowerShell.
2. En GitHub, crea un repositorio **público** llamado `lectio`. No hace falta añadir README, licencia ni `.gitignore` desde GitHub porque ya están en este proyecto.
3. Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
git init
git add .
git commit -m "Prepare Lectio for GitHub Pages"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/lectio.git
git push -u origin main
```

4. En el repositorio, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
5. Abre **Actions** y espera a que termine “Publish Lectio to GitHub Pages”. El enlace será `https://TU-USUARIO.github.io/lectio/`.

Los siguientes `git push` a `main` publican actualizaciones automáticamente. No subas `node_modules/`, `data/` ni la base SQLite; `.gitignore` ya los excluye.

## Límite entre Pages y el backend

GitHub Pages no ejecuta Node ni endpoints `/api`; allí Lectio funciona en modo de muestra y los datos quedan en el navegador. Para tener cuentas, ofertas, follows, Plaza y chat compartidos, despliega la API Node con PostgreSQL. El servidor usa SQLite local cuando no existe `DATABASE_URL`, y Postgres cuando se configura.

## API compartida gratis (Render + Neon)

La plantilla [render.yaml](render.yaml) publica la aplicación completa en Render. La base vive en Neon, así que Render no necesita un disco persistente ni se publica la SQLite local.

1. Crea un proyecto Postgres en [Neon](https://neon.com/) con el plan Free y copia su **pooled connection string**. No pegues ese secreto en GitHub ni en el chat.
2. En Render, elige **New → Blueprint** y conecta `itzlunis21/Lectio`.
3. Cuando Render solicite `DATABASE_URL`, pega allí la cadena de Neon como variable secreta. El blueprint configura `npm ci && npm run build`, `node server.mjs` y `/api/health`.
4. Despliega. Render entrega una URL `https://...onrender.com`; abre `/api/health` para verificarlo y comparte esa URL para las funciones multiusuario.

Neon Free no tiene una fecha fija de borrado, pero tiene límites de almacenamiento/uso y pausa el cómputo inactivo. Render Free también duerme servicios sin tráfico, así que el primer acceso puede tardar. Revisa sus límites actuales antes de invitar a toda una clase. GitHub Pages puede seguir como demo estática.

No publiques `data/`, `.env` ni `DATABASE_URL`.

## Imágenes

Las fotos locales y sus fuentes/licencia están documentadas en [public/IMAGE-CREDITS.md](public/IMAGE-CREDITS.md). Se usan bajo la licencia Unsplash; no son obras de dominio público.

## Seguridad

Consulta [SECURITY.md](SECURITY.md) para el estado y los controles pendientes antes de operar intercambios, chat o pagos reales.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
