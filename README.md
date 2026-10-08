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

GitHub Pages no ejecuta Node, SQLite ni endpoints `/api`. El frontend público se puede compartir sin contraseña, pero sus funciones interactivas no comparten cuentas, ofertas, seguimientos, chats ni publicaciones entre visitantes mientras la API no esté desplegada en un host Node con almacenamiento persistente y HTTPS. El backend de este repositorio sirve para desarrollo local; publicar `dist` por sí solo no lo vuelve un servicio multiusuario.

Antes de abrir la API al público, configura un host Node, un volumen persistente para `LECTIO_DB_PATH`, HTTPS y copias de seguridad. No publiques el archivo SQLite ni secretos.

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
