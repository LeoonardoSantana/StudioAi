/**
 * Controlador del Visor Interactivo:
 * - Comparador Antes/Después con ejemplos incluidos por preset y overrides manuales opcionales
 * - Preview de Video mediante GIFs incluidos por preset y duración
 * - Compresión inteligente de imágenes subidas en cliente
 */
(function (global) {
    'use strict';

    const StudioAI = (global.StudioAI = global.StudioAI || {});

    let videoPreviewToken = 0;
    let videoPreviewActive = false;

    /**
     * Comprime y redimensiona imágenes grandes en el cliente a máx 1536px
     * para reducir el peso de subida a Modal de ~10MB a ~250KB sin pérdida visual.
     */
    function compressAndResizeImage(dataUrl, maxDimension = 1536) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function () {
                let width = img.naturalWidth || 768;
                let height = img.naturalHeight || 768;

                if (width > maxDimension || height > maxDimension) {
                    if (width >= height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                width = Math.max(256, Math.round(width / 8) * 8);
                height = Math.max(256, Math.round(height / 8) * 8);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                resolve({
                    dataUrl: optimizedDataUrl,
                    width,
                    height
                });
            };
            img.onerror = function () {
                resolve({
                    dataUrl,
                    width: 768,
                    height: 768
                });
            };
            img.src = dataUrl;
        });
    }

    function moveCompareSlider(percentage) {
        const val = Math.max(5, Math.min(95, Number(percentage) || 50));
        const clipper = document.getElementById('beforeClipper');
        const sliderLine = document.getElementById('sliderLine');
        const sliderInput = document.getElementById('compareSlider');

        if (clipper) {
            clipper.style.clipPath = `inset(0 ${100 - val}% 0 0)`;
        }
        if (sliderLine) {
            sliderLine.style.left = `${val}%`;
        }
        if (sliderInput && Number(sliderInput.value) !== val) {
            sliderInput.value = String(val);
        }
    }

    const REFERENCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    function normalizeReferenceSources(source) {
        if (!source) return [];
        const items = Array.isArray(source) ? source : [source];
        return items.flatMap((src) => {
            if (!src) return [];
            if (
                src.startsWith('data:') ||
                /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(src)
            ) {
                return [src];
            }
            return REFERENCE_EXTENSIONS.map((ext) => `${src}.${ext}`);
        });
    }

    function setReferenceVisual(container, sources, alt, fallbackHtml) {
        const uniqueSources = [...new Set(sources)];
        container.innerHTML = '';
        if (uniqueSources.length === 0) {
            container.innerHTML = fallbackHtml;
            return;
        }

        const img = document.createElement('img');
        img.className = 'max-h-[340px] max-w-full object-contain rounded-lg';
        img.alt = alt;
        let sourceIndex = 0;
        img.onerror = function () {
            sourceIndex += 1;
            if (sourceIndex < uniqueSources.length) {
                img.src = uniqueSources[sourceIndex];
                return;
            }
            img.onerror = null;
            container.innerHTML = fallbackHtml;
        };
        img.src = uniqueSources[0];
        container.appendChild(img);
    }

    /**
     * Actualiza el comparador Antes/Después usando primero las imágenes incluidas
     * del preset y después cualquier referencia manual guardada por el usuario.
     */
    function updateBeforeAfterVisuals(
        preset,
        fixedRefBefore,
        fixedRefAfter,
        generatedAfter
    ) {
        const p = preset || StudioAI.Config.PRESETS[0];
        const beforeEl = document.getElementById('beforeVisual');
        const afterEl = document.getElementById('afterVisual');
        if (!beforeEl || !afterEl) return;

        const beforeSources = [
            ...normalizeReferenceSources(p.exampleBefore),
            ...normalizeReferenceSources(fixedRefBefore),
            ...normalizeReferenceSources(StudioAI.Config.DEFAULT_EXAMPLE_BEFORE)
        ];
        const afterSources = [
            ...normalizeReferenceSources(p.exampleAfter),
            ...normalizeReferenceSources(fixedRefAfter),
            ...normalizeReferenceSources(generatedAfter)
        ];

        setReferenceVisual(
            beforeEl,
            beforeSources,
            'Referencia Antes del preset',
            `
                <div class="w-full h-full flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                    <svg class="w-28 h-28 text-slate-600 mb-2" viewBox="0 0 200 200" fill="none">
                        <rect x="25" y="25" width="150" height="150" rx="20" stroke="currentColor" stroke-width="2" stroke-dasharray="6 6"/>
                        <circle cx="100" cy="75" r="25" fill="#334155"/>
                        <path d="M55 160 C55 120, 145 120, 145 160" fill="#334155"/>
                    </svg>
                    <p class="text-xs font-bold text-slate-300">ANTES: ${p.beforeDesc}</p>
                    <p class="text-[11px] text-slate-500 mt-1">Archivo esperado: ${p.exampleBefore}.jpg/png/webp</p>
                </div>
            `
        );

        setReferenceVisual(
            afterEl,
            afterSources,
            'Referencia Después del preset',
            `
                <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center relative overflow-hidden"
                     style="background: radial-gradient(circle at 50% 35%, ${p.themeColor}33 0%, #020617 75%);">
                    <svg class="w-28 h-28 mb-2" viewBox="0 0 200 200" fill="none">
                        <defs>
                            <linearGradient id="gradAfter" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stop-color="${p.themeColor}"/>
                                <stop offset="100%" stop-color="#6366f1"/>
                            </linearGradient>
                        </defs>
                        <rect x="25" y="25" width="150" height="150" rx="20" stroke="url(#gradAfter)" stroke-width="3"/>
                        <circle cx="100" cy="75" r="25" fill="url(#gradAfter)"/>
                        <circle cx="92" cy="69" r="3.5" fill="#ffffff" opacity="0.85"/>
                        <path d="M52 160 C52 115, 148 115, 148 160" fill="url(#gradAfter)"/>
                    </svg>
                    <p class="text-xs font-bold text-white">DESPUÉS: ${p.afterDesc}</p>
                    <p class="text-[11px] text-slate-400 mt-1">Archivo esperado: ${p.exampleAfter}.jpg/png/webp</p>
                </div>
            `
        );
    }

    function setVideoPauseEnabled(enabled) {
        const pauseBtn = document.getElementById('pauseBtn');
        if (!pauseBtn) return;
        pauseBtn.disabled = !enabled;
        pauseBtn.classList.toggle('opacity-50', !enabled);
        pauseBtn.classList.toggle('cursor-not-allowed', !enabled);
    }

    function updateVideoPresetPreview(preset, durationSeconds) {
        const previewEl = document.getElementById('videoPresetPreview');
        const canvas = document.getElementById('videoDemoCanvas');
        if (!previewEl || !canvas) return;

        videoPreviewToken += 1;
        const token = videoPreviewToken;
        videoPreviewActive = false;
        previewEl.onload = null;
        previewEl.onerror = null;
        previewEl.classList.add('hidden');
        previewEl.removeAttribute('src');
        canvas.classList.remove('hidden');
        setVideoPauseEnabled(false);

        const previewBase =
            preset &&
            preset.videoPreviews &&
            (preset.videoPreviews[durationSeconds] ||
                preset.videoPreviews.default);
        const sources = normalizeReferenceSources(previewBase);
        if (sources.length === 0) return;

        let sourceIndex = 0;
        const tryNextSource = () => {
            if (token !== videoPreviewToken) return;
            if (sourceIndex >= sources.length) {
                previewEl.classList.add('hidden');
                canvas.classList.remove('hidden');
                videoPreviewActive = false;
                setVideoPauseEnabled(false);
                return;
            }
            previewEl.src = sources[sourceIndex];
            sourceIndex += 1;
        };

        previewEl.onload = function () {
            if (token !== videoPreviewToken) return;
            videoPreviewActive = true;
            previewEl.classList.remove('hidden');
            canvas.classList.add('hidden');
            setVideoPauseEnabled(false);
        };
        previewEl.onerror = tryNextSource;
        tryNextSource();
    }

    function stopVideoDemoCanvas() {
        videoPreviewToken += 1;
        videoPreviewActive = false;
        const previewEl = document.getElementById('videoPresetPreview');
        const canvas = document.getElementById('videoDemoCanvas');
        if (previewEl) {
            previewEl.onload = null;
            previewEl.onerror = null;
            previewEl.classList.add('hidden');
            previewEl.removeAttribute('src');
        }
        if (canvas) {
            canvas.classList.remove('hidden');
        }
        setVideoPauseEnabled(false);
    }

    function drawVideoPreviewFallback(canvas, preset, durationSeconds) {
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 640, 360);
        gradient.addColorStop(0, '#020617');
        gradient.addColorStop(1, `${preset.themeColor}33`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = `${preset.themeColor}88`;
        ctx.lineWidth = 2;
        ctx.strokeRect(190, 88, 260, 184);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Vista previa del preset', 320, 152);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.fillText(
            preset.previewLink
                ? 'Pulsa "🎬 Ejemplo real" para ver una muestra'
                : 'La animación real se genera con tu foto',
            320,
            182
        );
        ctx.fillStyle = '#64748b';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillText(
            `El resultado aparecerá aquí en ${durationSeconds} seg de video`,
            320,
            207
        );
    }

    function startVideoDemoCanvas(preset, videoDurationSeconds) {
        const canvas = document.getElementById('videoDemoCanvas');
        if (!canvas) return;
        canvas.width = 640;
        canvas.height = 360;

        const activePreset =
            preset && preset.category === 'video' ? preset : StudioAI.Config.PRESETS[5];
        const resultVideo = document.getElementById('resultVideo');
        if (resultVideo) {
            resultVideo.pause();
            resultVideo.classList.add('hidden');
        }

        const labelEl = document.getElementById('videoDemoLabel');
        const infoEl = document.getElementById('videoPresetInfo');
        const sampleLink = document.getElementById('presetSampleLink');
        if (labelEl) {
            labelEl.textContent = `Demo Wan 2.1: ${activePreset.name} (${videoDurationSeconds}s)`;
        }
        if (infoEl) {
            infoEl.textContent = `${activePreset.afterDesc} • ${videoDurationSeconds} seg`;
        }
        if (sampleLink) {
            if (activePreset.previewLink) {
                sampleLink.href = activePreset.previewLink;
                sampleLink.classList.remove('hidden');
            } else {
                sampleLink.classList.add('hidden');
                sampleLink.removeAttribute('href');
            }
        }

        stopVideoDemoCanvas();
        drawVideoPreviewFallback(canvas, activePreset, videoDurationSeconds);
        updateVideoPresetPreview(activePreset, videoDurationSeconds);
    }

    function toggleVideoPause() {
        return true;
    }

    StudioAI.Viewer = {
        compressAndResizeImage,
        moveCompareSlider,
        updateBeforeAfterVisuals,
        startVideoDemoCanvas,
        stopVideoDemoCanvas,
        toggleVideoPause
    };
})(window);
