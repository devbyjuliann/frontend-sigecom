# Convenciones del repositorio frontend-sigecom

## Commits

- Usar Conventional Commits con descripciones claras y específicas en español.
- Mantener el formato `<tipo>(<ámbito>): <descripción en español>`; el ámbito es opcional.
- Usar tipos convencionales como `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci` y `chore`.
- La descripción debe resumir el cambio concreto y evitar mensajes genéricos; por ejemplo: `fix(login): centra el bloque de acceso`.
- No reescribir commits históricos para cambiarles el idioma o el formato.

## Estado de publicación

- El ajuste de Login y título está desplegado en el servicio frontend de Railway.
- Se verificaron HTTPS, el título `SIGECOM`, la pantalla de Login y la disponibilidad de la API; la sesión anónima responde 401 como corresponde.
- La autenticación exitosa en producción aún requiere una cuenta de prueba autorizada. No crear etiquetas ni Releases `v1.0.0` hasta verificarla.
