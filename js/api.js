/**
 * Servicio de red y comunicación con el Servidor Serverless en Modal.com.
 * Utiliza Cola Asíncrona (/sdapi/v1/job/submit + polling ligero cada 2.5s)
 * para evitar cualquier corte de conexión ("Load failed") en Safari/Chrome.
 */
(function (global) {
    'use strict';

    const StudioAI = (global.StudioAI = global.StudioAI || {});

    function normalizeUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        return rawUrl.trim().replace(/\/+$/, '');
    }

    function computeTargetDimensions(quality, uploadedWidth = 832, uploadedHeight = 1216, isVideo = false) {
        const safeWidth = uploadedWidth > 0 ? uploadedWidth : 832;
        const safeHeight = uploadedHeight > 0 ? uploadedHeight : 1216;
        const aspect = safeWidth / safeHeight || 1;

        if (isVideo) {
            return {
                width: aspect >= 1 ? 832 : 480,
                height: aspect >= 1 ? 480 : 832,
                enable_hr: false,
                hr_scale: 1.0
            };
        }

        if (aspect < 0.78) {
            return { width: 832, height: 1216, enable_hr: false, hr_scale: 1.0 };
        } else if (aspect < 0.92) {
            return { width: 896, height: 1152, enable_hr: false, hr_scale: 1.0 };
        } else if (aspect <= 1.08) {
            return { width: 1024, height: 1024, enable_hr: false, hr_scale: 1.0 };
        } else if (aspect <= 1.28) {
            return { width: 1152, height: 896, enable_hr: false, hr_scale: 1.0 };
        }
        return { width: 1216, height: 832, enable_hr: false, hr_scale: 1.0 };
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timer);
        }
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getImageDataUrlDimensions(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    async function checkServerStatus(rawUrl) {
        const apiUrl = normalizeUrl(rawUrl);
        if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
            return {
                online: false,
                message: 'Ingresa una URL válida de Modal.com (https://...modal.run).'
            };
        }

        try {
            const response = await fetchWithTimeout(
                `${apiUrl}/sdapi/v1/sd-models`,
                {
                    method: 'GET',
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                },
                30000
            );

            if (response.ok) {
                let modelTitle = 'Motor IA';
                try {
                    const models = await response.json();
                    if (Array.isArray(models) && models.length > 0 && models[0].title) {
                        modelTitle = models[0].title;
                    }
                } catch (e) {
                    // Ignorar
                }

                return {
                    online: true,
                    message: `Conectado y listo (${modelTitle}). Detección automática de ropa y cola asíncrona activas.`
                };
            }

            return {
                online: false,
                message:
                    'El servidor respondió pero aún está inicializando en segundo plano. Espera unos segundos y vuelve a probar.'
            };
        } catch (err) {
            return {
                online: false,
                message:
                    'No se pudo conectar con la URL indicada. Verifica tu enlace .modal.run.'
            };
        }
    }

    async function checkBillingStatus(rawUrl) {
        const apiUrl = normalizeUrl(rawUrl);
        if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
            return { ok: false, can_generate: false, error: 'URL inválida' };
        }

        try {
            const response = await fetchWithTimeout(
                `${apiUrl}/sdapi/v1/billing-status`,
                {
                    method: 'GET',
                    headers: { 'Bypass-Tunnel-Reminder': 'true' }
                },
                15000
            );
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok, ...data };
        } catch (err) {
            return { ok: false, can_generate: false, error: String(err) };
        }
    }

    // Margen sobre el timeout del backend (ImageEngine 300s, VideoEngine 900s)
    // más arranque en frío: si el navegador se rinde antes, Modal sigue
    // generando y cobrando un resultado que nunca se muestra.
    function getMaxWaitMs(mediaType) {
        return mediaType === 'video' ? 1080000 : 480000;
    }

    async function pollJobUntilDone(apiUrl, callId, mediaType, maxWaitMs = getMaxWaitMs(mediaType)) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            await sleep(2500);
            try {
                const statusRes = await fetchWithTimeout(
                    `${apiUrl}/sdapi/v1/job/status/${encodeURIComponent(callId)}?media_type=${encodeURIComponent(mediaType)}`,
                    {
                        method: 'GET',
                        headers: { 'Bypass-Tunnel-Reminder': 'true' }
                    },
                    20000
                );

                if (!statusRes.ok) {
                    continue;
                }

                const statusData = await statusRes.json();
                if (statusData.status === 'processing') {
                    continue;
                }

                if (statusData.status === 'failed') {
                    const serverErr = new Error(statusData.error || 'Error en la ejecución de la GPU');
                    serverErr.serverError = true;
                    throw serverErr;
                }

                if (statusData.status === 'completed') {
                    return statusData;
                }
            } catch (err) {
                if (err && err.serverError) {
                    throw err;
                }
                // Micro-corte de red ("Load failed" en Safari, "Failed to fetch" en
                // Chrome, AbortError por timeout o pestaña suspendida): reintentar
            }
        }
        throw new Error('Tiempo de espera agotado en la cola de GPU');
    }

    function buildMediaResult(data, dims) {
        if (data && data.video) {
            const rawVid = data.video;
            return Promise.resolve({
                ok: true,
                mediaType: 'video',
                dataUrl: rawVid.startsWith('data:') ? rawVid : `data:video/mp4;base64,${rawVid}`,
                dimensions: dims
            });
        }
        if (data && Array.isArray(data.images) && data.images.length > 0) {
            const rawImg = data.images[0];
            const generatedDataUrl = rawImg.startsWith('data:')
                ? rawImg
                : `data:image/png;base64,${rawImg}`;
            return getImageDataUrlDimensions(generatedDataUrl).then((outputDims) => ({
                ok: true,
                mediaType: 'image',
                dataUrl: generatedDataUrl,
                dimensions: outputDims || dims
            }));
        }
        throw new Error('La respuesta del servidor no contiene multimedia válida.');
    }

    /**
     * Retoma un trabajo ya enviado (p. ej. si iOS recargó la pestaña mientras
     * la GPU generaba) para no perder un resultado que ya se pagó.
     */
    async function resumeJob(rawUrl, callId, mediaType, dims = null) {
        const apiUrl = normalizeUrl(rawUrl);
        try {
            const data = await pollJobUntilDone(apiUrl, callId, mediaType);
            return await buildMediaResult(data, dims);
        } catch (err) {
            return { ok: false, dimensions: dims, error: err };
        }
    }

    async function generateMedia(params) {
        const {
            rawUrl,
            prompt,
            negativePrompt,
            steps,
            cfgScale,
            denoiseStrength,
            loraScale,
            loraId,
            maskTarget,
            skinPreAdapt,
            quality,
            base64Image,
            faceImage,
            imgWidth,
            imgHeight,
            isVideo,
            videoDurationSeconds,
            seed,
            preserveLimbs,
            blendMode,
            detailRestore,
            colorRestore,
            expandBody,
            fullBody,
            frameScale,
            controlScale,
            outpaintSteps,
            outpaintControlScale,
            imageEngine,
            onSubmitted
        } = params;

        const apiUrl = normalizeUrl(rawUrl);
        const dims = computeTargetDimensions(quality, imgWidth, imgHeight, isVideo);

        if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
            return {
                ok: false,
                dimensions: dims,
                error: new Error('URL de API inválida o vacía')
            };
        }

        const payload = {
            prompt,
            negative_prompt: negativePrompt || StudioAI.Config.DEFAULT_NEGATIVE_PROMPT,
            steps,
            cfg_scale: cfgScale,
            lora_scale: typeof loraScale === 'number'
                ? loraScale
                : isVideo
                ? 0.85
                : 0.0,
            lora_id: loraId || null,
            mask_target: maskTarget || 'all_clothes',
            skin_pre_adapt: skinPreAdapt !== false,
            width: dims.width,
            height: dims.height
        };

        if (Number.isFinite(seed)) {
            payload.seed = seed;
        }
        if (typeof preserveLimbs === 'boolean') {
            payload.preserve_limbs = preserveLimbs;
        }
        if (typeof blendMode === 'string' && blendMode.trim()) {
            payload.blend_mode = blendMode;
        }
        if (Number.isFinite(detailRestore)) {
            payload.detail_restore = detailRestore;
        }
        if (Number.isFinite(colorRestore)) {
            payload.color_restore = colorRestore;
        }
        if (typeof expandBody === 'boolean') {
            payload.expand_body = expandBody;
        }
        if (typeof fullBody === 'boolean') {
            payload.full_body = fullBody;
        }
        if (Number.isFinite(frameScale)) {
            payload.frame_scale = frameScale;
        }
        if (Number.isFinite(controlScale)) {
            payload.control_scale = controlScale;
        }
        if (Number.isFinite(outpaintSteps)) {
            payload.outpaint_steps = outpaintSteps;
        }
        if (Number.isFinite(outpaintControlScale)) {
            payload.outpaint_control_scale = outpaintControlScale;
        }

        if (base64Image) {
            payload.init_images = [base64Image];
            payload.denoising_strength = denoiseStrength;
        }
        if (isVideo && typeof faceImage === 'string' && faceImage) {
            payload.face_image = faceImage;
        }

        if (isVideo) {
            payload.is_video = true;
            payload.video_duration_seconds = videoDurationSeconds;
        } else if (typeof imageEngine === 'string' && imageEngine) {
            payload.image_engine = imageEngine;
        }

        try {
            // 1. Intentar envío por cola asíncrona (responde en <0.1s y evita "Load failed")
            const submitRes = await fetchWithTimeout(
                `${apiUrl}/sdapi/v1/job/submit`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Bypass-Tunnel-Reminder': 'true'
                    },
                    body: JSON.stringify(payload)
                },
                30000
            );

            let data;
            if (submitRes.ok) {
                const submitJson = await submitRes.json();
                const jobMediaType = submitJson.media_type || (isVideo ? 'video' : 'image');
                if (typeof onSubmitted === 'function') {
                    try {
                        await onSubmitted(submitJson.call_id, jobMediaType);
                    } catch (e) {
                        // Guardar el trabajo pendiente es opcional
                    }
                }
                data = await pollJobUntilDone(apiUrl, submitJson.call_id, jobMediaType);
            } else {
                if (submitRes.status === 402 || submitRes.status === 403) {
                    const detail = await submitRes.json().catch(() => ({}));
                    const creditErr = new Error(detail.detail || `HTTP ${submitRes.status}`);
                    creditErr.serverError = true;
                    throw creditErr;
                }
                // Respaldo síncrono si se usa otro servidor distinto a Modal
                const fallbackEndpoint = isVideo
                    ? '/sdapi/v1/img2vid'
                    : base64Image
                    ? '/sdapi/v1/img2img'
                    : '/sdapi/v1/txt2img';
                const syncRes = await fetchWithTimeout(
                    `${apiUrl}${fallbackEndpoint}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Bypass-Tunnel-Reminder': 'true'
                        },
                        body: JSON.stringify(payload)
                    },
                    240000
                );
                if (!syncRes.ok) {
                    const httpErr = new Error(`HTTP ${syncRes.status}`);
                    httpErr.serverError = syncRes.status >= 500;
                    throw httpErr;
                }
                data = await syncRes.json();
            }

            return await buildMediaResult(data, dims);
        } catch (err) {
            return {
                ok: false,
                dimensions: dims,
                error: err
            };
        }
    }

    StudioAI.Api = {
        resumeJob,
        normalizeUrl,
        computeTargetDimensions,
        checkServerStatus,
        checkBillingStatus,
        generateMedia
    };
})(window);
