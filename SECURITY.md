# Seguridad de Lectio

## Estado actual

`server.mjs` implementa una API same-origin con SQLite, registro e inicio de sesión, hash de contraseñas con scrypt, cookies de sesión `HttpOnly`/`SameSite`, token CSRF, validación de entradas, consultas parametrizadas y autorización de ofertas, solicitudes, conversaciones, follows, bloqueos y reportes. Arranca localmente con `npm run start:built`; los datos quedan en `data/lectio.sqlite`.

GitHub Pages solo publica el frontend estático. Allí Lectio activa un modo de muestra explícito donde los cambios se guardan en el navegador y no se comparten entre visitantes. Para cuentas, follows, ofertas, Plaza y chat compartidos, hay que desplegar `server.mjs` en un host Node con HTTPS y almacenamiento persistente; Pages por sí solo no ejecuta la API.

La interfaz también bloquea algunos correos, teléfonos, enlaces, direcciones y credenciales; no habilita el chat hasta aceptar una solicitud; y renderiza texto como texto, nunca como HTML. Estas validaciones de cliente mejoran la experiencia, pero el servidor debe ser siempre la autoridad.

## Requisitos antes de operar intercambios reales

- Autenticar cada cuenta en servidor; almacenar contraseñas con Argon2id o un proveedor de identidad. Nunca guardar contraseñas, tokens o sesiones en `localStorage`.
- Autorizar en servidor cada lectura y cambio de oferta, solicitud, conversación, seguimiento, bloqueo y reporte. No confiar en estados o IDs enviados por el cliente.
- Proteger sesiones con cookies `HttpOnly`, `Secure` y `SameSite`; añadir protección CSRF a operaciones con sesión y límites de intentos para acceso y recuperación.
- Cifrar el transporte con HTTPS y los datos sensibles almacenados; definir retención, exportación y eliminación de datos personales conforme a la Ley 1581 de 2012 y su reglamentación.
- Para chat: validar tamaño y formato del mensaje en servidor, limitar frecuencia por cuenta e IP, mantener controles de bloqueo/reportes, moderación y un procedimiento de escalamiento. No publicar teléfono, correo ni dirección de entrega.
- Para intercambios: verificar participantes y titularidad, registrar cambios de estado en servidor y ofrecer cancelación, disputa y trazabilidad. Procesar pagos mediante un proveedor especializado; no almacenar datos de tarjeta.
- Desplegar con una política CSP ajustada, HSTS, `X-Content-Type-Options`, `Referrer-Policy` y una `Permissions-Policy` mínima; registrar eventos de seguridad sin guardar secretos.
- Probar autorización por objeto, XSS, CSRF, abuso de solicitudes y enumeración de cuentas antes de abrir el servicio al público; preparar respaldo y respuesta a incidentes.

La API actual usa límites de frecuencia en memoria y SQLite local: son adecuados para desarrollo de una instancia, no para escalar varias réplicas. Antes de producción, migra los límites a un almacén compartido, añade verificación/recuperación de correo, limpieza de sesiones, moderación administrativa, respaldos y pruebas de penetración. El pago del encuentro es una muestra y no se procesa.