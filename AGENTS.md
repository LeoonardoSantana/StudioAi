# StudioAi — reglas del proyecto

## Versionado

- Al hacer commit y push de cambios, actualizar también el número de
  versión visible en `index.html` (badge `vX.Y` junto al título
  "Studio AI").

## Comandos útiles

- Verificación JS: `node --check js/<archivo>.js`
- Lint Python: `flake8 backend/modal_app.py --select E501`
- Deploy backend: `modal deploy backend/modal_app.py`

## Notas

- El badge de versión está en `index.html`, línea del header.
