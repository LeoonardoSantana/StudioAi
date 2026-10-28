/**
 * Controlador principal de la aplicación Estudio IA.
 * - Muestra ejemplos Antes/Después incluidos por preset, con overrides manuales opcionales
 * - La imagen subida en el Paso 1 solo se usa como entrada para generación automática
 * - Muestra los resultados reales generados por IA en su propia vista limpia
 */
(function (global) {
    'use strict';

    const StudioAI = (global.StudioAI = global.StudioAI || {});

    const state = {
        currentMode: 'img2img',
        selectedQuality: 'balanced',
        videoDurationSeconds: 5,
        imageEngine: 'lustify',
        base64UploadedImage: null,
        base64FaceImage: null,
        uploadedImgWidth: 768,
        uploadedImgHeight: 768,
        fixedRefBefore: null,
        fixedRefAfter: null,
        currentPreset: null,
        customLoraId: null,
        currentFilter: 'image',
        viewerMode: 'compare',
        lastGeneratedResultUrl: null,
        lastGeneratedMediaType: 'image',
        isGenerating: false,
        isCheckingServer: false,
        isCheckingBilling: false,
        billingCheckPromise: null,
        lastBillingStatus: null,
        cloudGuideTab: 'modal',
        lastImageGpuWarmAt: 0,
        lastVideoGpuWarmAt: 0
    };

    const mediaObjectUrls = new Map();

    function getMimeTypeFromDataUrl(dataUrl, fallback = 'image/png') {
        const match = /^data:([^;,]+)/.exec(String(dataUrl || ''));
        return match ? match[1] : fallback;
    }

    function dataUrlToBlob(dataUrl) {
        const raw = String(dataUrl || '');
        const commaIndex = raw.indexOf(',');
        if (!raw.startsWith('data:') || commaIndex < 0) {
            throw new Error('Formato de archivo inválido');
        }
        const header = raw.slice(0, commaIndex);
        const body = raw.slice(commaIndex + 1);
        const mime = getMimeTypeFromDataUrl(raw);
        const bytes = header.includes(';base64')
            ? atob(body.replace(/\s/g, ''))
            : decodeURIComponent(body);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i += 1) {
            arr[i] = bytes.charCodeAt(i);
        }
        return new Blob([arr], { type: mime });
    }

    function getPlayableMediaUrl(dataUrl) {
        if (!dataUrl || !String(dataUrl).startsWith('data:video/')) {
            return dataUrl;
        }
        if (!mediaObjectUrls.has(dataUrl)) {
            try {
                mediaObjectUrls.set(
                    dataUrl,
                    URL.createObjectURL(dataUrlToBlob(dataUrl))
                );
            } catch (err) {
                mediaObjectUrls.set(dataUrl, dataUrl);
            }
        }
        return mediaObjectUrls.get(dataUrl);
    }

    function isIOSLikeDevice() {
        return (
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        );
    }

    async function saveDataUrlAsFile(dataUrl, fileName) {
        const blob = dataUrlToBlob(dataUrl);
        let file = null;
        try {
            file = new File([blob], fileName, { type: blob.type });
        } catch (err) {
            file = null;
        }

        if (file && isIOSLikeDevice() && navigator.canShare) {
            const shareData = { files: [file], title: fileName };
            if (navigator.canShare(shareData)) {
                try {
                    await navigator.share(shareData);
                    return 'shared';
                } catch (err) {
                    if (err && err.name === 'AbortError') return 'cancelled';
                }
            }
        }

        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        a.rel = 'noopener';
        if (isIOSLikeDevice()) a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return isIOSLikeDevice() ? 'opened' : 'downloaded';
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // Continuar al método alternativo
            }
        }
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (err) {
            copied = false;
        }
        document.body.removeChild(temp);
        return copied;
    }

    function showMessage(text, isWarning = false) {
        const box = document.getElementById('statusBox');
        if (!box) return;

        box.classList.remove(
            'hidden',
            'bg-amber-950/60',
            'border-amber-800',
            'text-amber-200',
            'bg-indigo-950/60',
            'border-indigo-800',
            'text-indigo-200'
        );

        if (isWarning) {
            box.classList.add('bg-amber-950/60', 'border-amber-800', 'text-amber-200');
        } else {
            box.classList.add('bg-indigo-950/60', 'border-indigo-800', 'text-indigo-200');
        }
        box.textContent = text;
    }

    function updateCreditBalanceBadge(status) {
        const badge = document.getElementById('creditBalanceBadge');
        if (!badge) return;

        const baseClass =
            'text-[10px] px-2 py-1 rounded-full border font-bold whitespace-nowrap cursor-pointer transition';
        const remaining = status && Number(status.remaining_usd);
        const hasValue = status && status.ok && Number.isFinite(remaining);

        let toneClass =
            'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700';
        let text = 'Créditos: --';
        if (hasValue) {
            if (remaining < 1) {
                toneClass =
                    'bg-rose-950/70 text-rose-300 border-rose-800 hover:bg-rose-900';
            } else if (remaining < 3) {
                toneClass =
                    'bg-amber-950/70 text-amber-300 border-amber-800 hover:bg-amber-900';
            } else {
                toneClass =
                    'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900';
            }
            text = `Créditos: $${remaining.toFixed(2)}`;
        }

        badge.className = `${baseClass} ${toneClass}`;
        badge.textContent = text;
        badge.title = hasValue
            ? 'Créditos restantes aproximados en Modal'
            : 'No se pudo consultar el saldo de Modal';
    }

    async function refreshBillingStatus(rawUrl) {
        if (state.billingCheckPromise) {
            return state.billingCheckPromise;
        }
        state.isCheckingBilling = true;
        state.billingCheckPromise = (async () => {
            try {
                const status = await StudioAI.Api.checkBillingStatus(rawUrl);
                state.lastBillingStatus = status;
                updateCreditBalanceBadge(status);
                return status;
            } finally {
                state.isCheckingBilling = false;
                state.billingCheckPromise = null;
            }
        })();
        return state.billingCheckPromise;
    }

    function saveApiUrlSetting(val) {
        const cleanVal = String(val || '').trim();
        const apiInput = document.getElementById('apiUrl');
        const modalInput = document.getElementById('modalApiUrl');

        if (apiInput && apiInput.value !== cleanVal) {
            apiInput.value = cleanVal;
        }
        if (modalInput && modalInput.value !== cleanVal) {
            modalInput.value = cleanVal;
        }

        StudioAI.Storage.saveSetting('apiUrl', cleanVal);
    }

    const DEFAULT_MODAL_URL =
        'https://leonardo-sh170--estudio-ia-serverless-api.us-east.modal.run';

    function getGeneratedImageFallback() {
        return state.lastGeneratedMediaType === 'image'
            ? state.lastGeneratedResultUrl
            : null;
    }

    async function loadSavedSettings() {
        // 1. Cargar URL de API
        const params = new URLSearchParams(global.location.search);
        const urlParamApi = params.get('api');
        if (urlParamApi) {
            saveApiUrlSetting(urlParamApi);
        } else {
            const savedUrl = await StudioAI.Storage.getSetting('apiUrl');
            const effectiveUrl =
                savedUrl && !savedUrl.includes('pinggy-free.link')
                    ? savedUrl
                    : DEFAULT_MODAL_URL;
            saveApiUrlSetting(effectiveUrl);
        }

        // 2. Cargar overrides manuales opcionales del comparador Antes/Después
        const savedBefore = await StudioAI.Storage.getSetting('fixedRefBefore');
        const savedAfter = await StudioAI.Storage.getSetting('fixedRefAfter');
        if (savedBefore) state.fixedRefBefore = savedBefore;
        if (savedAfter) state.fixedRefAfter = savedAfter;
    }

    /**
     * Guarda un override manual opcional para el comparador Antes/Después.
     * Si el preset ya incluye sus imágenes, estas rutas solo actúan como respaldo.
     */
    function uploadFixedReference(side, event) {
        const files = event && event.target && event.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.type || !file.type.startsWith('image/')) {
            showMessage('Selecciona una imagen válida para tu referencia fija.', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            const compressed = await StudioAI.Viewer.compressAndResizeImage(e.target.result, 1280);
            if (side === 'before') {
                state.fixedRefBefore = compressed.dataUrl;
                await StudioAI.Storage.saveSetting('fixedRefBefore', compressed.dataUrl);
                showMessage('Imagen de referencia "ANTES" guardada como ajuste manual.');
            } else {
                state.fixedRefAfter = compressed.dataUrl;
                await StudioAI.Storage.saveSetting('fixedRefAfter', compressed.dataUrl);
                showMessage('Imagen de referencia "DESPUÉS" guardada como ajuste manual.');
            }

            StudioAI.Viewer.updateBeforeAfterVisuals(
                state.currentPreset || StudioAI.Config.PRESETS[0],
                state.fixedRefBefore,
                state.fixedRefAfter,
                getGeneratedImageFallback()
            );
        };
        reader.readAsDataURL(file);
    }

    async function copyShareableUrl() {
        const apiInput = document.getElementById('apiUrl');
        const currentApi = apiInput ? apiInput.value.trim() : '';
        const baseUrl = global.location.origin + global.location.pathname;
        const shareUrl = `${baseUrl}?api=${encodeURIComponent(currentApi)}`;

        await copyTextToClipboard(shareUrl);
        const btn = document.getElementById('btnCopyShareUrl');
        if (btn) {
            const originalText = '🔗 Copiar Link con GPU autoconectada';
            btn.textContent = '✅ ¡Link copiado!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2500);
        }
    }

    async function copyKaggleScript() {
        const codeId = state.cloudGuideTab === 'kaggle' ? 'kaggleSilentCode' : 'modalDeployCode';
        const btnId = state.cloudGuideTab === 'kaggle' ? 'copyKaggleBtn' : 'copyModalBtn';
        const codeEl = document.getElementById(codeId);
        if (!codeEl) return;

        await copyTextToClipboard(codeEl.innerText);
        const btn = document.getElementById(btnId);
        if (btn) {
            const originalText = btn.dataset.label || 'Copiar Comandos';
            btn.textContent = '✅ ¡Copiado!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }

    function switchCloudTab(tab) {
        state.cloudGuideTab = tab;
        const tabModalBtn = document.getElementById('tabGuideModal');
        const tabKaggleBtn = document.getElementById('tabGuideKaggle');
        const panelModal = document.getElementById('panelGuideModal');
        const panelKaggle = document.getElementById('panelGuideKaggle');

        if (tab === 'kaggle') {
            if (tabKaggleBtn) {
                tabKaggleBtn.className =
                    'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold transition';
            }
            if (tabModalBtn) {
                tabModalBtn.className =
                    'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition';
            }
            if (panelKaggle) panelKaggle.classList.remove('hidden');
            if (panelModal) panelModal.classList.add('hidden');
        } else {
            if (tabModalBtn) {
                tabModalBtn.className =
                    'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold transition';
            }
            if (tabKaggleBtn) {
                tabKaggleBtn.className =
                    'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition';
            }
            if (panelModal) panelModal.classList.remove('hidden');
            if (panelKaggle) panelKaggle.classList.add('hidden');
        }
    }

    async function checkServerStatus() {
        if (state.isCheckingServer) return;
        state.isCheckingServer = true;

        const apiInput = document.getElementById('apiUrl');
        const rawUrl = apiInput ? apiInput.value : '';
        const dot = document.getElementById('serverDot');

        showMessage(
            '⏳ Verificando conexión con tu servidor Serverless en Modal.com...'
        );

        try {
            const result = await StudioAI.Api.checkServerStatus(rawUrl);
            let billingStatus = null;
            if (dot) {
                dot.className = result.online
                    ? 'w-2 h-2 rounded-full bg-emerald-400'
                    : 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
            }
            if (result.online) {
                billingStatus = await refreshBillingStatus(rawUrl);
            } else {
                updateCreditBalanceBadge(null);
            }

            let message = result.message;
            let warning = !result.online;
            if (result.online) {
                const remaining = billingStatus && Number(billingStatus.remaining_usd);
                if (billingStatus && billingStatus.ok && Number.isFinite(remaining)) {
                    message += ` Créditos aprox. $${remaining.toFixed(2)}.`;
                } else {
                    message += ' No pude consultar los créditos restantes.';
                    warning = true;
                }
            }
            showMessage(message, warning);
        } finally {
            state.isCheckingServer = false;
        }
    }

    function setElementHidden(id, hidden) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', hidden);
    }

    function updateModeVisibility(category) {
        const isVideo = category === 'video';
        const imageOnlyIds = [
            'imageQualityBox',
            'denoiseOption',
            'engineOption'
        ];
        const videoOnlyIds = [
            'videoDurationBox',
            'faceReferenceBox',
            'promptAssistantBox'
        ];

        imageOnlyIds.forEach((id) => setElementHidden(id, isVideo));
        videoOnlyIds.forEach((id) => setElementHidden(id, !isVideo));

        const uploadTitle = document.getElementById('uploadTitle');
        const uploadHint = document.getElementById('uploadHint');
        const promptEl = document.getElementById('prompt');

        if (uploadTitle) {
            uploadTitle.textContent = isVideo
                ? 'Sube la imagen base para animar'
                : 'Sube tu imagen a procesar';
        }
        if (uploadHint) {
            uploadHint.textContent = isVideo
                ? 'Wan 2.1 usará esta foto como primer fotograma'
                : 'No reemplaza tus imágenes de referencia de la derecha';
        }
        if (promptEl) {
            promptEl.placeholder = isVideo
                ? 'Elige un preset de video o describe el movimiento que debe hacer...'
                : 'Elige un preset de foto o describe la ropa, anatomía o pose que quieres cambiar...';
        }
    }

    function setMainCategory(category) {
        const btnImg = document.getElementById('tab-cat-image');
        const btnVid = document.getElementById('tab-cat-video');

        const activeClass =
            'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 text-white shadow transition flex items-center justify-center gap-2';
        const inactiveClass =
            'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition flex items-center justify-center gap-2';

        if (category === 'image') {
            if (btnImg) btnImg.className = activeClass;
            if (btnVid) btnVid.className = inactiveClass;
            updateModeVisibility('image');
            filterPresets('image');
            selectPreset('img-realism');
        } else {
            if (btnVid) btnVid.className = activeClass;
            if (btnImg) btnImg.className = inactiveClass;
            updateModeVisibility('video');
            filterPresets('video');
            selectPreset('vid-breathing');
        }
    }

    function setVideoDuration(seconds) {
        const sec = Number(seconds) || 5;
        state.videoDurationSeconds = sec;

        const inactive =
            'py-2 px-2.5 rounded-xl border border-slate-800 bg-slate-950 text-center transition hover:border-slate-700';
        const active =
            'py-2 px-2.5 rounded-xl border border-purple-500/70 bg-purple-950/40 text-center transition shadow-sm';

        [5, 10, 20].forEach((s) => {
            const btn = document.getElementById(`dur-${s}`);
            if (btn) btn.className = s === sec ? active : inactive;
        });

        const durationMeta = StudioAI.Config.VIDEO_DURATIONS[sec] || {
            frames: 80,
            estimatedGpuTime: '~45 seg'
        };
        const hintEl = document.getElementById('durationCostHint');
        if (hintEl) {
            hintEl.textContent = `${durationMeta.frames} frames (${durationMeta.estimatedGpuTime})`;
        }

        if (
            state.currentPreset &&
            state.currentPreset.category === 'video' &&
            state.viewerMode === 'video'
        ) {
            StudioAI.Viewer.startVideoDemoCanvas(
                state.currentPreset,
                state.videoDurationSeconds,
                state.base64UploadedImage
            );
        }
    }

    function setImageEngine(engine) {
        const key = engine === 'urpm' ? 'urpm' : 'lustify';
        state.imageEngine = key;

        const inactive =
            'py-1.5 px-2 rounded-lg border border-slate-800 bg-slate-950 text-[11px] font-bold text-slate-400 transition hover:border-slate-600';
        const active =
            'py-1.5 px-2 rounded-lg border border-emerald-500/60 bg-emerald-950/30 text-[11px] font-bold text-emerald-300 transition';

        ['lustify', 'urpm'].forEach((k) => {
            const btn = document.getElementById(`eng-${k}`);
            if (btn) btn.className = k === key ? active : inactive;
        });
    }

    function populateCustomLoraSelect() {
        const select = document.getElementById('customLoraSelect');
        if (!select) return;
        const options = [{ id: '', label: 'Sin LoRA (solo tu prompt)' }];
        StudioAI.Config.PRESETS.forEach((p) => {
            if (
                p.category === 'video' &&
                p.loraId &&
                !options.some((o) => o.id === p.loraId)
            ) {
                options.push({ id: p.loraId, label: p.badge || p.loraId });
            }
        });
        select.innerHTML = options
            .map((o) => `<option value="${o.id}">${o.label}</option>`)
            .join('');
        select.value = state.customLoraId || '';
    }

    function setCustomLora(value) {
        state.customLoraId = value || '';
    }

    function applyAssistantPrompt() {
        const promptEl = document.getElementById('prompt');
        if (!promptEl) return;
        const parts = [
            'assistAction',
            'assistFocus',
            'assistPace',
            'assistCamera',
            'assistExtra'
        ]
            .map((id) => {
                const el = document.getElementById(id);
                return el && el.value ? el.value.trim() : '';
            })
            .filter(Boolean);
        if (!parts.length) return;
        promptEl.value =
            parts.join(', ') + '. Realistic motion, natural skin detail.';
    }

    function resetPresetPrompt() {
        const promptEl = document.getElementById('prompt');
        if (promptEl && state.currentPreset) {
            promptEl.value = state.currentPreset.prompt;
        }
    }

    function setQuality(quality) {
        state.selectedQuality = quality;
        const inactive =
            'p-2 rounded-xl border border-slate-800 bg-slate-950 text-left transition hover:border-slate-700';
        const active =
            'p-2 rounded-xl border border-emerald-500/70 bg-emerald-950/30 text-left transition shadow-sm';

        ['draft', 'balanced', 'original'].forEach((item) => {
            const btn = document.getElementById(`q-${item}`);
            if (btn) btn.className = item === quality ? active : inactive;
        });
    }

    function renderPresets() {
        const grid = document.getElementById('presetsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const filtered = StudioAI.Config.PRESETS.filter(
            (p) => p.category === state.currentFilter
        );

        const VIDEO_GROUPS = [
            ['undress', '🔓 ACEPTA ROPA — el video genera el desnudo'],
            ['nude', '🔥 NECESITA NUDE/ACCIÓN — solo añade movimiento'],
            ['any', '✨ FUNCIONA CON CUALQUIER FOTO']
        ];
        if (state.currentFilter === 'video') {
            const order = { undress: 0, nude: 1, any: 2 };
            filtered.sort(
                (a, b) =>
                    (order[a.inputType] !== undefined
                        ? order[a.inputType]
                        : 2) -
                    (order[b.inputType] !== undefined
                        ? order[b.inputType]
                        : 2)
            );
        }
        let lastGroup = null;

        filtered.forEach((preset) => {
            const isSelected = state.currentPreset && state.currentPreset.id === preset.id;
            const isVideo = preset.category === 'video';

            if (isVideo) {
                const grp = preset.inputType || 'any';
                const meta = VIDEO_GROUPS.find(([k]) => k === grp);
                if (meta && grp !== lastGroup) {
                    lastGroup = grp;
                    const gheader = document.createElement('div');
                    gheader.className =
                        'sm:col-span-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 border-t border-slate-800/70 pt-2 mt-1 first:border-0 first:pt-0 first:mt-0';
                    gheader.textContent = meta[1];
                    grid.appendChild(gheader);
                }
            }

            const card = document.createElement('div');
            card.dataset.presetId = preset.id;
            card.className = `p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-1.5 ${
                isSelected
                    ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                    : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-600'
            }`;
            card.addEventListener('click', () => selectPreset(preset.id));

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between gap-2';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-xs font-bold text-white';
            titleSpan.textContent = preset.name;

            const badgeSpan = document.createElement('span');
            badgeSpan.className = 'text-[10px] px-2 py-0.5 rounded-md font-semibold shrink-0';
            badgeSpan.style.background = `${preset.themeColor}20`;
            badgeSpan.style.color = preset.themeColor;
            badgeSpan.style.border = `1px solid ${preset.themeColor}40`;
            badgeSpan.textContent = `${isVideo ? '🎬 ' : '✨ '}${preset.badge}`;

            header.appendChild(titleSpan);
            header.appendChild(badgeSpan);

            const descP = document.createElement('p');
            descP.className = 'text-[11px] text-slate-400';
            descP.textContent = preset.desc || preset.afterDesc;

            card.appendChild(header);
            card.appendChild(descP);

            if (preset.tips) {
                const tipsP = document.createElement('p');
                tipsP.className = 'text-[10px] text-slate-500 italic';
                tipsP.textContent = `📷 ${preset.tips}`;
                card.appendChild(tipsP);
            }

            if (preset.previewLink) {
                const link = document.createElement('a');
                link.href = preset.previewLink;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className =
                    'text-[10px] font-bold text-fuchsia-400 hover:text-fuchsia-300 transition w-fit';
                link.textContent = '🎬 Ver ejemplo real ↗';
                link.addEventListener('click', (e) => e.stopPropagation());
                card.appendChild(link);
            }

            grid.appendChild(card);
        });
    }

    function filterPresets(type) {
        state.currentFilter = type;
        ['image', 'video'].forEach((t) => {
            const btn = document.getElementById(`filter-${t}`);
            if (btn) {
                btn.className =
                    t === type
                        ? 'px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-medium'
                        : 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white';
            }
        });
        renderPresets();
    }

    function selectPreset(id) {
        const preset = StudioAI.Config.getPresetById(id);
        if (!preset) return;

        state.currentPreset = preset;
        state.currentMode = preset.mode;

        const badgeEl = document.getElementById('activePresetBadge');
        const promptEl = document.getElementById('prompt');
        const stepsEl = document.getElementById('steps');
        const stepsValEl = document.getElementById('stepsVal');
        const cfgEl = document.getElementById('cfg');
        const cfgValEl = document.getElementById('cfgVal');
        const denoiseEl = document.getElementById('denoise');
        const denoiseValEl = document.getElementById('denoiseVal');
        const loraEl = document.getElementById('loraScale');
        const loraValEl = document.getElementById('loraVal');

        if (badgeEl) badgeEl.textContent = preset.name;
        if (promptEl) promptEl.value = preset.prompt;

        if (preset.customLoraSelectable) {
            populateCustomLoraSelect(preset);
            setElementHidden('customLoraRow', false);
        } else {
            setElementHidden('customLoraRow', true);
        }
        if (stepsEl) stepsEl.value = String(preset.steps);
        if (stepsValEl) stepsValEl.textContent = String(preset.steps);
        if (cfgEl) cfgEl.value = String(preset.cfg);
        if (cfgValEl) cfgValEl.textContent = String(preset.cfg);
        if (denoiseEl) denoiseEl.value = String(preset.denoise);
        if (denoiseValEl) denoiseValEl.textContent = String(preset.denoise);
        if (loraEl && typeof preset.loraScale === 'number') {
            loraEl.value = String(preset.loraScale);
        }
        if (loraValEl && typeof preset.loraScale === 'number') {
            loraValEl.textContent = String(preset.loraScale);
        }

        updateModeVisibility(preset.category);

        renderPresets();

        setViewerMode(preset.category === 'video' ? 'video' : 'compare');
    }

    function setViewerMode(mode) {
        const isVideoPreset =
            state.currentPreset && state.currentPreset.category === 'video';
        const hasImageResult =
            state.lastGeneratedMediaType === 'image' &&
            Boolean(state.lastGeneratedResultUrl);

        if (isVideoPreset) {
            mode = 'video';
        } else {
            if (mode === 'video' || (mode === 'result' && !hasImageResult)) {
                mode = 'compare';
            }
        }

        state.viewerMode = mode;
        const compareEl = document.getElementById('compareContainer');
        const videoEl = document.getElementById('videoDemoContainer');
        const resultContainerEl = document.getElementById('resultContainer');
        const btnCompare = document.getElementById('btnViewCompare');
        const btnVideo = document.getElementById('btnViewVideo');
        const btnResult = document.getElementById('btnViewResult');
        const btnUseForVideo = document.getElementById('btnUseForVideo');
        const badge = document.getElementById('viewerModeBadge');
        const hint = document.getElementById('viewerHint');
        const resultVideo = document.getElementById('resultVideo');

        if (resultVideo && mode !== 'video') {
            resultVideo.pause();
            resultVideo.classList.add('hidden');
        }

        const activeBtnClass =
            'text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium transition';
        const inactiveBtnClass =
            'text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white font-medium transition';

        if (btnCompare) {
            btnCompare.className = mode === 'compare' ? activeBtnClass : inactiveBtnClass;
            btnCompare.classList.toggle('hidden', isVideoPreset);
        }
        if (btnVideo) {
            btnVideo.className = mode === 'video' ? activeBtnClass : inactiveBtnClass;
            btnVideo.classList.toggle('hidden', !isVideoPreset);
        }
        if (btnResult) {
            btnResult.className = mode === 'result' ? activeBtnClass : inactiveBtnClass;
            btnResult.classList.toggle(
                'hidden',
                isVideoPreset || !hasImageResult
            );
        }
        if (btnUseForVideo) {
            btnUseForVideo.classList.toggle(
                'hidden',
                isVideoPreset || !hasImageResult
            );
        }

        if (compareEl) compareEl.classList.add('hidden');
        if (videoEl) {
            videoEl.classList.add('hidden');
            videoEl.classList.remove('flex');
        }
        if (resultContainerEl) {
            resultContainerEl.classList.add('hidden');
            resultContainerEl.classList.remove('flex');
        }

        if (mode === 'video') {
            if (videoEl) {
                videoEl.classList.remove('hidden');
                videoEl.classList.add('flex');
            }
            if (badge) badge.textContent = '🎬 Vista previa GIF + Wan 2.1 I2V';
            if (hint) hint.textContent = 'Solo se muestra el GIF incluido del preset según 5s, 10s o 20s';

            StudioAI.Viewer.startVideoDemoCanvas(
                state.currentPreset,
                state.videoDurationSeconds,
                state.base64UploadedImage
            );
        } else if (mode === 'result') {
            StudioAI.Viewer.stopVideoDemoCanvas();
            if (resultContainerEl) {
                resultContainerEl.classList.remove('hidden');
                resultContainerEl.classList.add('flex');
            }
            if (badge) badge.textContent = '✨ Resultado Generado por IA';
            if (hint) hint.textContent = 'Tu imagen generada está lista y guardada en tu historial';
        } else {
            StudioAI.Viewer.stopVideoDemoCanvas();
            if (compareEl) compareEl.classList.remove('hidden');
            if (badge) badge.textContent = '↔ Ejemplos Antes y Después del Preset';
            if (hint) hint.textContent = 'Imágenes incluidas en el proyecto; los botones solo sirven para cambiarlas manualmente';

            StudioAI.Viewer.updateBeforeAfterVisuals(
                state.currentPreset || StudioAI.Config.PRESETS[0],
                state.fixedRefBefore,
                state.fixedRefAfter,
                getGeneratedImageFallback()
            );
        }
    }

    function useResultForVideo() {
        if (!state.lastGeneratedResultUrl || state.lastGeneratedMediaType !== 'image') {
            showMessage('Primero genera o selecciona una imagen editada para enviarla a Video.', true);
            return;
        }

        state.base64UploadedImage = state.lastGeneratedResultUrl;
        const img = document.getElementById('uploadedPreview');
        const placeholder = document.getElementById('uploadPlaceholder');
        const btnRemove = document.getElementById('btnRemoveUpload');

        if (img) {
            img.src = state.base64UploadedImage;
            img.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (btnRemove) btnRemove.classList.remove('hidden');

        setMainCategory('video');
        showMessage(
            'Tu foto generada se cargó como base en el Paso 1. Ahora pulsa "Generar Resultado Ahora" para animarla con Wan 2.1.'
        );
    }

    function processImageFile(file) {
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            showMessage('Por favor selecciona un archivo de imagen válido (JPG, PNG, WEBP).', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            const rawDataUrl = e.target.result;
            const compressed = await StudioAI.Viewer.compressAndResizeImage(rawDataUrl, 1536);

            state.base64UploadedImage = compressed.dataUrl;
            state.uploadedImgWidth = compressed.width;
            state.uploadedImgHeight = compressed.height;

            const img = document.getElementById('uploadedPreview');
            const placeholder = document.getElementById('uploadPlaceholder');
            const btnRemove = document.getElementById('btnRemoveUpload');
            const dimBadge = document.getElementById('origDimensions');

            if (img) {
                img.src = state.base64UploadedImage;
                img.classList.remove('hidden');
            }
            if (placeholder) placeholder.classList.add('hidden');
            if (btnRemove) btnRemove.classList.remove('hidden');
            if (dimBadge) {
                dimBadge.textContent = `${state.uploadedImgWidth}×${state.uploadedImgHeight}px`;
                dimBadge.classList.remove('hidden');
            }

            if (state.viewerMode === 'video') {
                StudioAI.Viewer.startVideoDemoCanvas(
                    state.currentPreset,
                    state.videoDurationSeconds,
                    state.base64UploadedImage
                );
            }
        };
        reader.readAsDataURL(file);
    }

    function previewUpload(event) {
        const files = event && event.target && event.target.files;
        if (!files || files.length === 0) return;
        processImageFile(files[0]);
    }

    function previewFaceReference(event) {
        const files = event && event.target && event.target.files;
        const file = files && files[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            showMessage('Selecciona una imagen válida para la referencia facial.', true);
            return;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            const compressed = await StudioAI.Viewer.compressAndResizeImage(
                e.target.result,
                1024
            );
            state.base64FaceImage = compressed.dataUrl;

            const img = document.getElementById('faceRefPreview');
            const placeholder = document.getElementById('faceRefPlaceholder');
            const btnRemove = document.getElementById('btnRemoveFaceRef');
            if (img) {
                img.src = compressed.dataUrl;
                img.classList.remove('hidden');
            }
            if (placeholder) placeholder.classList.add('hidden');
            if (btnRemove) btnRemove.classList.remove('hidden');
            showMessage(
                'Referencia facial lista. Si el rostro base está incompleto, Wan intentará usarla.'
            );
        };
        reader.readAsDataURL(file);
    }

    function clearFaceReference(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        state.base64FaceImage = null;
        const fileInput = document.getElementById('faceInput');
        const img = document.getElementById('faceRefPreview');
        const placeholder = document.getElementById('faceRefPlaceholder');
        const btnRemove = document.getElementById('btnRemoveFaceRef');
        if (fileInput) fileInput.value = '';
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
        if (btnRemove) btnRemove.classList.add('hidden');
    }

    function clearUploadedImage(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        state.base64UploadedImage = null;
        state.uploadedImgWidth = 768;
        state.uploadedImgHeight = 768;

        const fileInput = document.getElementById('imageInput');
        const img = document.getElementById('uploadedPreview');
        const placeholder = document.getElementById('uploadPlaceholder');
        const dimBadge = document.getElementById('origDimensions');
        const btnRemove = document.getElementById('btnRemoveUpload');

        if (fileInput) fileInput.value = '';
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
        if (dimBadge) dimBadge.classList.add('hidden');
        if (btnRemove) btnRemove.classList.add('hidden');

        if (state.viewerMode === 'video') {
            StudioAI.Viewer.startVideoDemoCanvas(
                state.currentPreset,
                state.videoDurationSeconds,
                null
            );
        }
    }

    async function loadHistoryGallery() {
        const gallery = document.getElementById('historyGallery');
        const badge = document.getElementById('historyCountBadge');
        const clearBtn = document.getElementById('btnClearAll');
        if (!gallery) return;

        const items = await StudioAI.Storage.getAllCreations();

        if (badge) {
            badge.textContent = `${items.length} guardado${items.length === 1 ? '' : 's'}`;
        }
        if (clearBtn) {
            if (items.length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        }

        if (items.length === 0) {
            gallery.innerHTML = `
                <div class="col-span-full py-6 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                    Aún no hay resultados guardados. Cada imagen (Lustify SDXL) o video (Wan 2.1) aparecerá aquí automáticamente.
                </div>
            `;
            return;
        }

        gallery.innerHTML = '';
        items.forEach((item) => {
            const card = document.createElement('div');
            card.className =
                'bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between group hover:border-indigo-500/60 transition';

            const isVidPreset = item.type === 'video';
            const isVideoStream =
                typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:video/');
            const playableUrl = getPlayableMediaUrl(item.dataUrl);

            const mediaWrapper = document.createElement('div');
            mediaWrapper.className =
                'relative h-28 bg-slate-900 flex items-center justify-center overflow-hidden cursor-pointer';
            mediaWrapper.addEventListener('click', () => previewFromVault(item.id));

            if (isVideoStream) {
                const videoEl = document.createElement('video');
                videoEl.src = playableUrl;
                videoEl.className = 'w-full h-full object-cover';
                videoEl.autoplay = true;
                videoEl.loop = true;
                videoEl.muted = true;
                videoEl.playsInline = true;
                mediaWrapper.appendChild(videoEl);
            } else {
                const imgEl = document.createElement('img');
                imgEl.src = playableUrl;
                imgEl.className = 'w-full h-full object-cover group-hover:scale-105 transition';
                imgEl.alt = item.presetName || 'Resultado IA';
                mediaWrapper.appendChild(imgEl);
            }

            const typeBadge = document.createElement('span');
            typeBadge.className =
                'absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-200 border border-slate-700';
            typeBadge.textContent = isVidPreset ? `🎬 ${item.duration || 5}s` : '📸 Foto';
            mediaWrapper.appendChild(typeBadge);

            const hoverOverlay = document.createElement('div');
            hoverOverlay.className =
                'absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center';
            hoverOverlay.innerHTML =
                '<span class="text-[10px] bg-slate-950/90 text-white px-2 py-1 rounded-lg font-semibold">🔍 Ver Resultado</span>';
            mediaWrapper.appendChild(hoverOverlay);

            const body = document.createElement('div');
            body.className = 'p-2 flex flex-col gap-1.5';

            const metaRow = document.createElement('div');
            metaRow.className = 'flex items-center justify-between gap-1';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-[10px] font-semibold text-slate-200 truncate';
            titleSpan.title = item.presetName || 'Personalizado';
            titleSpan.textContent = item.presetName || 'Personalizado';

            const timeSpan = document.createElement('span');
            timeSpan.className = 'text-[9px] text-slate-500 shrink-0';
            timeSpan.textContent = item.timeStr || '';

            metaRow.appendChild(titleSpan);
            metaRow.appendChild(timeSpan);

            const actionsRow = document.createElement('div');
            actionsRow.className = 'grid grid-cols-2 gap-1';

            const btnDownload = document.createElement('button');
            btnDownload.type = 'button';
            btnDownload.className =
                'py-1 px-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-semibold transition flex items-center justify-center gap-1';
            btnDownload.textContent = isIOSLikeDevice() ? '⬇ Guardar' : '⬇ Descargar';
            btnDownload.addEventListener('click', () => downloadFromVault(item));

            const btnDelete = document.createElement('button');
            btnDelete.type = 'button';
            btnDelete.className =
                'py-1 px-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white text-[10px] font-semibold transition flex items-center justify-center gap-1';
            btnDelete.textContent = '✕ Borrar';
            btnDelete.addEventListener('click', () => deleteFromVault(item.id));

            actionsRow.appendChild(btnDownload);
            actionsRow.appendChild(btnDelete);

            body.appendChild(metaRow);
            body.appendChild(actionsRow);

            card.appendChild(mediaWrapper);
            card.appendChild(body);
            gallery.appendChild(card);
        });
    }

    async function previewFromVault(id) {
        const item = await StudioAI.Storage.getCreationById(id);
        if (!item) return;

        const isVideoStream =
            typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:video/');
        const playableUrl = getPlayableMediaUrl(item.dataUrl);
        const resultVideo = document.getElementById('resultVideo');
        const resultImg = document.getElementById('resultImage');
        const btnSendToVid = document.getElementById('btnUseForVideo');

        if (isVideoStream) {
            state.lastGeneratedResultUrl = item.dataUrl;
            state.lastGeneratedMediaType = 'video';
            if (!state.currentPreset || state.currentPreset.category !== 'video') {
                setMainCategory('video');
            }
            if (btnSendToVid) btnSendToVid.classList.add('hidden');
            setViewerMode('video');
            if (resultVideo) {
                resultVideo.src = playableUrl;
                resultVideo.classList.remove('hidden');
                resultVideo.play().catch(() => {});
            }
            showMessage(`Reproduciendo video desde tu carpeta: ${item.presetName}`);
            return;
        }

        state.lastGeneratedResultUrl = item.dataUrl;
        state.lastGeneratedMediaType = 'image';
        if (!state.currentPreset || state.currentPreset.category !== 'image') {
            setMainCategory('image');
        }
        if (btnSendToVid) btnSendToVid.classList.remove('hidden');
        if (resultImg) {
            resultImg.src = playableUrl;
        }
        setViewerMode('result');

        showMessage(
            `Mostrando resultado guardado: ${item.presetName}${
                item.duration ? ` (${item.duration}s)` : ''
            }`
        );
    }

    async function downloadFromVault(item) {
        if (!item || !item.dataUrl) return;

        const ext = StudioAI.Storage.getFileExtensionFromDataUrl(item.dataUrl, item.type);
        const cleanName = StudioAI.Storage.sanitizeFileName(item.presetName);
        const fileName = `Resultado_${cleanName}_${item.id}.${ext}`;

        try {
            const result = await saveDataUrlAsFile(item.dataUrl, fileName);
            if (result === 'shared') {
                showMessage('Se abrió Compartir; elige “Guardar en Archivos” o “Guardar video/foto”.');
            } else if (result === 'opened') {
                showMessage('Se abrió una vista previa; mantén presionado el archivo para guardarlo.');
            }
        } catch (err) {
            showMessage('No se pudo exportar el archivo en este navegador.', true);
        }
    }

    async function deleteFromVault(id) {
        await StudioAI.Storage.deleteCreation(id);
        await loadHistoryGallery();
        showMessage('Archivo eliminado de la carpeta del proyecto.');
    }

    async function clearAllHistory() {
        await StudioAI.Storage.clearAllCreations();
        await loadHistoryGallery();
        showMessage('Se vació todo el historial del proyecto.');
    }

    async function connectLocalProjectFolder() {
        const result = await StudioAI.Storage.connectLocalFolder();
        if (!result.supported) {
            showMessage(
                'Tu navegador guarda todo automáticamente en la galería inferior. Para vincular una carpeta directa del disco duro usa Chrome o Edge en PC.',
                true
            );
            return;
        }

        if (result.connected && result.folderName) {
            const btn = document.getElementById('btnFolderSync');
            if (btn) {
                btn.innerHTML = `<span>✅ Carpeta: ${result.folderName}</span>`;
                btn.className =
                    'text-[11px] bg-emerald-950/70 text-emerald-300 border border-emerald-600/60 px-2.5 py-1.5 rounded-xl font-semibold transition flex items-center gap-1';
            }
            showMessage(
                `¡Carpeta "${result.folderName}" conectada! Cada resultado se guardará tanto aquí en la app como directamente en tu carpeta.`
            );
        } else {
            showMessage(
                'Tus archivos se seguirán guardando automáticamente en la carpeta interna de la app (abajo).'
            );
        }
    }

    function toggleKaggleModal() {
        const modal = document.getElementById('kaggleModal');
        if (modal) {
            modal.classList.toggle('hidden');
        }
    }

    async function generateMedia() {
        if (state.isGenerating) return;

        const apiInput = document.getElementById('apiUrl');
        const promptInput = document.getElementById('prompt');
        const stepsInput = document.getElementById('steps');
        const cfgInput = document.getElementById('cfg');
        const denoiseInput = document.getElementById('denoise');
        const loraInput = document.getElementById('loraScale');
        const loadingEl = document.getElementById('loadingState');
        const loadingTextEl = document.getElementById('loadingStatusText');
        const generateBtn = document.getElementById('generateBtn');
        const btnSendToVid = document.getElementById('btnUseForVideo');
        const resultVideo = document.getElementById('resultVideo');
        const resultImg = document.getElementById('resultImage');

        const rawUrl = apiInput ? apiInput.value.trim() : '';
        const prompt = promptInput ? promptInput.value.trim() : '';
        const steps = stepsInput ? parseInt(stepsInput.value, 10) : 26;
        const cfgScale = cfgInput ? parseFloat(cfgInput.value) : 6.5;
        const denoiseStrength = denoiseInput ? parseFloat(denoiseInput.value) : 0.62;
        const loraScale = loraInput ? parseFloat(loraInput.value) : 0.0;

        if (!rawUrl) {
            showMessage(
                'Pega primero tu enlace de Modal.com (.modal.run) arriba a la derecha antes de generar.',
                true
            );
            return;
        }

        if (!prompt) {
            showMessage(
                'Por favor elige un preset de la lista o escribe qué cambio deseas hacer.',
                true
            );
            return;
        }

        const isVideoMode = Boolean(
            state.currentPreset && state.currentPreset.category === 'video'
        );
        const isEnhanceMode = Boolean(
            state.currentPreset && state.currentPreset.maskTarget === 'enhance'
        );
        const isFullBodyMode = Boolean(
            state.currentPreset && state.currentPreset.maskTarget === 'full_body'
        );

        if (isVideoMode && !state.base64UploadedImage) {
            showMessage(
                'Wan 2.1 I2V necesita una imagen base en el Paso 1 para animarla (o primero genera una foto y pulsa "Pasar Resultado a Video").',
                true
            );
            return;
        }

        const billingStatus = await refreshBillingStatus(rawUrl);
        if (billingStatus.ok && billingStatus.can_generate === false) {
            const remaining = Number(billingStatus.remaining_usd);
            const amount = Number.isFinite(remaining)
                ? ` ($${remaining.toFixed(2)} restantes aprox.)`
                : '';
            showMessage(`Ya no tienes créditos suficientes en Modal${amount}.`, true);
            return;
        }
        if (!billingStatus.ok || billingStatus.can_generate !== true) {
            showMessage(
                'No pude verificar tu saldo de Modal; por seguridad no envié la generación.',
                true
            );
            return;
        }

        state.isGenerating = true;
        if (generateBtn) generateBtn.disabled = true;
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
            loadingEl.classList.add('flex');
        }

        const inlineBox = document.getElementById('inlineProgressBox');
        const inlineBar = document.getElementById('inlineProgressBar');
        const inlinePct = document.getElementById('inlineProgressPct');
        const inlinePhase = document.getElementById('inlineProgressPhase');
        const inlineSub = document.getElementById('inlineProgressSub');
        const inlineEta = document.getElementById('inlineProgressEta');
        const viewerBar = document.getElementById('viewerProgressBar');
        const viewerPct = document.getElementById('viewerProgressPct');
        const viewerEta = document.getElementById('viewerProgressEta');

        if (inlineBox) inlineBox.classList.remove('hidden');

        const nowMs = Date.now();
        const isGpuWarm = isVideoMode
            ? nowMs - state.lastVideoGpuWarmAt < 110000
            : nowMs - state.lastImageGpuWarmAt < 140000;

        // Tiempo total estimado según duración real y si la GPU ya está encendida
        const videoEstimate = { 5: 45, 10: 90, 20: 180 };
        const baseVideoEstimate =
            videoEstimate[state.videoDurationSeconds] || videoEstimate[5];
        const estTotalSec = isVideoMode
            ? isGpuWarm
                ? baseVideoEstimate
                : baseVideoEstimate + 35
            : isGpuWarm
            ? isFullBodyMode
                ? 55
                : 22
            : isFullBodyMode
            ? 95
            : 58;

        const startMs = Date.now();
        const setProgressUi = (pctValue, phaseText, etaText, subText) => {
            const clampedPct = Math.max(0, Math.min(100, Math.round(pctValue)));
            if (inlineBar) inlineBar.style.width = `${clampedPct}%`;
            if (viewerBar) viewerBar.style.width = `${clampedPct}%`;
            if (inlinePct) inlinePct.textContent = `${clampedPct}%`;
            if (viewerPct) viewerPct.textContent = `${clampedPct}%`;
            if (inlinePhase) inlinePhase.textContent = phaseText;
            if (loadingTextEl) loadingTextEl.textContent = phaseText;
            if (inlineEta) inlineEta.textContent = etaText;
            if (viewerEta) viewerEta.textContent = etaText;
            if (inlineSub && subText) inlineSub.textContent = subText;
        };

        const updateProgressTick = () => {
            const elapsedSec = (Date.now() - startMs) / 1000;
            const elapsedInt = Math.floor(elapsedSec);
            const remainingSec = Math.max(1, Math.ceil(estTotalSec - elapsedSec));

            let pct;
            if (elapsedSec <= estTotalSec * 0.88) {
                pct = (elapsedSec / estTotalSec) * 88;
            } else {
                const extra = elapsedSec - estTotalSec * 0.88;
                pct = 88 + 8 * (1 - Math.exp(-extra / 12));
            }

            let phaseText;
            let subText;
            if (isVideoMode) {
                subText = `Wan 2.1 I2V + LoRA (${state.videoDurationSeconds}s reales)`;
                if (!isGpuWarm && elapsedSec < 14) {
                    phaseText = 'Fase 1/3: Encendiendo GPU A100-80GB en Modal...';
                } else if (pct < 82) {
                    phaseText = 'Fase 2/3: Animando fotogramas desde tu foto...';
                } else {
                    phaseText = 'Fase 3/3: Codificando archivo de video MP4...';
                }
            } else if (isEnhanceMode) {
                subText = 'Real-ESRGAN + restauración fotográfica sin cambiar identidad';
                if (!isGpuWarm && elapsedSec < 16) {
                    phaseText = 'Fase 1/3: Despertando GPU A100-80GB y cargando restaurador...';
                } else if (pct < 82) {
                    phaseText = 'Fase 2/3: Eliminando grano y reconstruyendo detalle...';
                } else {
                    phaseText = 'Fase 3/3: Ajustando nitidez, color e iluminación...';
                }
            } else if (isFullBodyMode) {
                subText = 'Etapa 1 tipo expand4 + etapa 2 de cuerpo completo';
                if (!isGpuWarm && elapsedSec < 16) {
                    phaseText = 'Fase 1/4: Despertando GPU A100-80GB y cargando modelo...';
                } else if (pct < 34) {
                    phaseText = 'Fase 2/4: Generando la base con pose protegida...';
                } else if (pct < 82) {
                    phaseText = 'Fase 3/4: Completando cadera, muslos y piernas...';
                } else {
                    phaseText = 'Fase 4/4: Uniendo iluminación y fondo...';
                }
            } else {
                subText = 'Detección automática de ropa + Rostro 100% protegido';
                if (!isGpuWarm && elapsedSec < 16) {
                    phaseText = 'Fase 1/3: Despertando GPU A100-80GB y cargando modelo...';
                } else if (pct < 32) {
                    phaseText = 'Fase 1/3: Detectando y borrando ropa automáticamente...';
                } else if (pct < 85) {
                    phaseText = `Fase 2/3: Renderizando ${steps} pasos en alta definición...`;
                } else {
                    phaseText = 'Fase 3/3: Fusionando rostro intacto e iluminación...';
                }
            }

            const etaText =
                elapsedSec < estTotalSec
                    ? `Faltan ~${remainingSec}s (Transcurrido: ${elapsedInt}s)`
                    : `Finalizando detalles... (${elapsedInt}s)`;

            setProgressUi(pct, phaseText, etaText, subText);
        };

        updateProgressTick();
        const timerInterval = setInterval(updateProgressTick, 250);

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const presetTitle = state.currentPreset ? state.currentPreset.name : 'Personalizado';

        try {
            const response = await StudioAI.Api.generateMedia({
                rawUrl,
                prompt,
                negativePrompt: state.currentPreset && state.currentPreset.negativePrompt
                    ? state.currentPreset.negativePrompt
                    : StudioAI.Config.DEFAULT_NEGATIVE_PROMPT,
                steps,
                cfgScale,
                denoiseStrength,
                loraScale,
                loraId: state.currentPreset
                    ? state.currentPreset.customLoraSelectable
                        ? state.customLoraId || 'none'
                        : state.currentPreset.loraId
                    : null,
                maskTarget: state.currentPreset ? state.currentPreset.maskTarget : 'all_clothes',
                skinPreAdapt: state.currentPreset ? state.currentPreset.skinPreAdapt : true,
                quality: state.selectedQuality,
                base64Image: state.base64UploadedImage,
                faceImage: isVideoMode ? state.base64FaceImage : null,
                imgWidth: state.uploadedImgWidth,
                imgHeight: state.uploadedImgHeight,
                isVideo: isVideoMode,
                videoDurationSeconds: state.videoDurationSeconds,
                seed: state.currentPreset ? state.currentPreset.seed : null,
                preserveLimbs: state.currentPreset
                    ? state.currentPreset.preserveLimbs
                    : null,
                blendMode: state.currentPreset
                    ? state.currentPreset.blendMode
                    : null,
                detailRestore: state.currentPreset
                    ? state.currentPreset.detailRestore
                    : null,
                colorRestore: state.currentPreset
                    ? state.currentPreset.colorRestore
                    : null,
                expandBody: state.currentPreset
                    ? state.currentPreset.expandBody
                    : null,
                fullBody: state.currentPreset
                    ? state.currentPreset.fullBody
                    : null,
                frameScale: state.currentPreset
                    ? state.currentPreset.frameScale
                    : null,
                controlScale: state.currentPreset
                    ? state.currentPreset.controlScale
                    : null,
                outpaintSteps: state.currentPreset
                    ? state.currentPreset.outpaintSteps
                    : null,
                outpaintControlScale: state.currentPreset
                    ? state.currentPreset.outpaintControlScale
                    : null,
                imageEngine: state.imageEngine
            });

            if (response.ok && response.dataUrl) {
                const totalElapsed = Math.max(1, Math.round((Date.now() - startMs) / 1000));
                if (isVideoMode) {
                    state.lastVideoGpuWarmAt = Date.now();
                } else {
                    state.lastImageGpuWarmAt = Date.now();
                }

                setProgressUi(
                    100,
                    '¡Generación completada!',
                    `Completado en ${totalElapsed}s`,
                    'Guardado automáticamente en tu historial'
                );

                state.lastGeneratedResultUrl = response.dataUrl;
                state.lastGeneratedMediaType =
                    response.mediaType || (isVideoMode ? 'video' : 'image');
                const playableResultUrl = getPlayableMediaUrl(response.dataUrl);

                if (state.lastGeneratedMediaType === 'video') {
                    if (btnSendToVid) btnSendToVid.classList.add('hidden');
                    setViewerMode('video');
                    if (resultVideo) {
                        resultVideo.src = playableResultUrl;
                        resultVideo.classList.remove('hidden');
                        resultVideo.play().catch(() => {});
                    }
                } else {
                    if (btnSendToVid) btnSendToVid.classList.remove('hidden');
                    if (resultImg) {
                        resultImg.src = playableResultUrl;
                    }
                    setViewerMode('result');
                }

                await StudioAI.Storage.saveCreation({
                    id: Date.now().toString(),
                    timestamp: Date.now(),
                    timeStr,
                    presetName: presetTitle,
                    type: state.lastGeneratedMediaType,
                    duration: isVideoMode ? state.videoDurationSeconds : null,
                    dataUrl: response.dataUrl
                });

                await loadHistoryGallery();
                showMessage(
                    state.lastGeneratedMediaType === 'video'
                        ? `¡Video MP4 generado en ${totalElapsed}s y guardado en tu Carpeta del Proyecto!`
                        : `¡Resultado generado con rostro 100% protegido (${response.dimensions.width}×${response.dimensions.height}px) en ${totalElapsed}s!`
                );
            } else {
                const errDetail =
                    response.error && response.error.message
                        ? response.error.message
                        : 'Sin respuesta del servidor';
                showMessage(
                    `No se pudo completar la generación en el servidor (${errDetail}). Verifica tu enlace .modal.run arriba a la derecha.`,
                    true
                );
            }
        } finally {
            refreshBillingStatus(rawUrl).catch(() => {});
            clearInterval(timerInterval);
            state.isGenerating = false;
            if (generateBtn) generateBtn.disabled = false;
            if (loadingEl) {
                loadingEl.classList.add('hidden');
                loadingEl.classList.remove('flex');
            }
            setTimeout(() => {
                if (!state.isGenerating && inlineBox) {
                    inlineBox.classList.add('hidden');
                }
            }, 1800);
        }
    }

    function bindDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        ['dragenter', 'dragover'].forEach((evtName) => {
            dropZone.addEventListener(evtName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dropzone-active');
            });
        });

        ['dragleave', 'drop'].forEach((evtName) => {
            dropZone.addEventListener(evtName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dropzone-active');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                processImageFile(dt.files[0]);
            }
        });
    }

    function bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('kaggleModal');
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            }
        });
    }

    async function init() {
        bindDragAndDrop();
        bindKeyboardShortcuts();

        await StudioAI.Storage.init();
        await loadSavedSettings();
        await loadHistoryGallery();
        setMainCategory('image');

        const apiInput = document.getElementById('apiUrl');
        const rawUrl = apiInput ? apiInput.value : '';
        if (rawUrl) {
            refreshBillingStatus(rawUrl).catch(() => {});
            setInterval(() => {
                const currentInput = document.getElementById('apiUrl');
                const currentUrl = currentInput ? currentInput.value : rawUrl;
                refreshBillingStatus(currentUrl).catch(() => {});
            }, 60000);
        }
    }

    Object.assign(global, {
        saveApiUrlSetting,
        checkServerStatus,
        toggleKaggleModal,
        switchCloudTab,
        setMainCategory,
        previewUpload,
        previewFaceReference,
        clearUploadedImage,
        clearFaceReference,
        uploadFixedReference,
        setQuality,
        setImageEngine,
        setVideoDuration,
        setCustomLora,
        applyAssistantPrompt,
        resetPresetPrompt,
        generateMedia,
        setViewerMode,
        useResultForVideo,
        moveCompareSlider: StudioAI.Viewer.moveCompareSlider,
        toggleVideoPause: StudioAI.Viewer.toggleVideoPause,
        filterPresets,
        selectPreset,
        connectLocalProjectFolder,
        clearAllHistory,
        copyKaggleScript,
        copyShareableUrl,
        previewFromVault,
        downloadFromVault,
        deleteFromVault
    });

    StudioAI.App = {
        init,
        state
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window);
