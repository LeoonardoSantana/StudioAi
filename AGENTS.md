# StudioAi — reglas del proyecto

## Versionado

- Al hacer commit y push de cambios, actualizar también el número de
  versión visible en `index.html` (badge `vX.Y` junto al título
  "Studio AI").

## Comandos útiles

- Verificación JS: `node --check js/<archivo>.js`
- Lint Python: `flake8 backend/modal_app.py --select E501`
- Deploy producción: `modal deploy backend/modal_app.py`
- Deploy desarrollo (app aislado, no toca prod):
  `STUDIO_APP_NAME=estudio-ia-serverless-dev modal deploy backend/modal_app.py`
- Endpoint prod: `https://leoonardo170--estudio-ia-serverless-api.us-east.modal.run`
- Endpoint dev: `https://leoonardo170--estudio-ia-serverless-dev-api.us-east.modal.run`
- Prueba de imagen: `python3 tools/test_image_gen.py <test> <nombre>`
  (env `STUDIO_API` para apuntar al endpoint dev)

## Reglas del motor de imagen (siempre vigentes)

- El rostro debe quedar intacto — la protección viene de la máscara
  (la cara nunca se enmascara), no del prompt ni de post-proceso.
- Prohibido superponer/encolar otra imagen sobre el resultado
  (sin face-lock, sin composite de cara). Se rechazó por verse falso.
- Los prompts deben ser genéricos: NO describir accesorios concretos
  (collar de color X, tatuaje Y) porque el modelo los inventa mal y no
  funciona para otras fotos. Los accesorios se preservan sacándolos de
  la máscara (detalles sobre piel no-piel → `protect_np`), no por texto.
- El objetivo de calidad es el último frame del Wan (`pruebas/result.mp4`):
  tono de piel fiel a la foto, anatomía natural, accesorios reales
  preservados. Comparar siempre contra ese frame.
- No mover seed, steps, CFG, scheduler ni modelo sin justificación
  explícita. Seeds válidas: 3, 5, 31, 37, 47 (37 = ganadora actual).
- Iteración barata: usar `draft: true` (~12 steps, sin refine) para
  validar prompt/máscara antes de pagar calidad completa. El borrador
  reproduce la misma composición que el full.
- Consultar `/sdapi/v1/billing-status` antes y después de cada prueba
  y registrar el coste. Presupuesto de experimentación: ~$2 por fase.
- Pruebas siempre contra el endpoint **dev**; prod solo cuando el
  usuario apruebe el resultado.

## Organización de pruebas

- Cada prueba/tanda nueva va en una subcarpeta de `pruebas/` con nombre
  descriptivo (p. ej. `pruebas/2025-01-apex/`); no mezclar resultados
  en la raíz. La carpeta raíz conserva `reference.JPG` y `result.mp4`
  (imagen de referencia y objetivo).
- Nombrar archivos con el patrón `<motor>_<test>_<seed>.png`.

## Reglas de video (resumen vigente)

- `body_only` en presets de undress/acción-corporal protege la cara de
  forma nativa (el modelo no regenera la región facial).
- No usar presets cuya mecánica cruce la cara (ropa por encima de la
  cabeza, mano sobre el lente): eliminados `clothes_on_off`,
  `woman_undressing`, `rip_shura`.
- Cadena cara-segura para undress total: `tittydrop` → `before_after`.
