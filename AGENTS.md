# Convenciones del repositorio frontend-sigecom

## Commits

- Usar Conventional Commits con descripciones claras y específicas en español.
- Mantener el formato `<tipo>(<ámbito>): <descripción en español>`; el ámbito es opcional.
- Usar tipos convencionales como `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci` y `chore`.
- La descripción debe resumir el cambio concreto y evitar mensajes genéricos; por ejemplo: `fix(login): centra el bloque de acceso`.
- No reescribir commits históricos para cambiarles el idioma o el formato.

## Estado de publicación

- El ajuste de Login y título está desplegado en el servicio frontend de Railway.
- El despliegue `0a6f5554-fdcf-44fc-996b-87f04f97285a` está en estado `SUCCESS`; Railway no expone un SHA en sus metadatos. El árbol fuente usado para cargarlo correspondía a `0f24ec0b06f622f34d0ff3ea2649d5126d159ff0`.
- En producción se verificaron CSRF, `POST /api/v1/auth/login`, `GET /api/v1/auth/me` y el Dashboard con respuestas exitosas. El único 401 fue la consulta anónima previa al ingreso.
- La etiqueta anotada `v1.0.0` apunta a `32d4d47fa34887d4df5a6206726158162d2737aa`. Release: https://github.com/devbyjuliann/frontend-sigecom/releases/tag/v1.0.0
