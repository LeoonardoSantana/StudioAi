/**
 * Configuración global y catálogo de Presets para Estudio IA.
 * Basados en:
 * - Motor Imagen: LUSTIFY SDXL Inpainting 9 canales + ControlNet OpenPose SDXL
 *   (máscara automática por SegFormer ATR + YOLOv8 Pose, preservación facial)
 * - Motor Video: Wan 2.1 I2V 14B 480P Lightning + LoRAs de Civitai (cola asíncrona)
 */
(function (global) {
    'use strict';

    const StudioAI = (global.StudioAI = global.StudioAI || {});

    const POSE_PRESERVE_NEGATIVE =
        'different pose, changed pose, altered body position, moved arms, moved legs, changed camera angle, zoomed crop, changed framing';

    const ANATOMY_NEGATIVE =
        'bad anatomy, extra limbs, extra fingers, missing fingers, deformed hands, distorted torso, extra breasts, bad nipples, cut arms, camera, phone, tripod, object in hands, holding object, device, prop, blurry, lowres, worst quality, low quality, watermark, signature';

    const DEFAULT_NEGATIVE_PROMPT = `${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;

    const NUDE_NEGATIVE_PROMPT =
        `clothes, clothing, shirt, t-shirt, top, dress, pants, leggings, jeans, shoes, footwear, socks, bra, bikini, underwear, panties, fabric, sleeves, collar, waistband, covered breasts, covered nipples, covered legs, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;

    const TOPLESS_NEGATIVE_PROMPT =
        `shirt, t-shirt, top, bra, bikini, bikini top, swimsuit, swimwear, straps, covered breasts, covered nipples, closed cleavage, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;

    const ENHANCE_NEGATIVE_PROMPT =
        `different face, changed facial features, different person, changed identity, beautified face, face morph, changed body shape, changed pose, changed camera angle, altered background, new objects, camera, tripod, plastic skin, airbrushed, oversharpened, halo, cartoon, painting, illustration, grain, noise, jpeg artifacts, blur, overexposed, underexposed, watermark, text, signature`;

    const WAN_NEGATIVE_PROMPT =
        'lowres, blurry, overexposed, worst quality, low quality, deformed, distorted anatomy, morphing face, changing identity, extra limbs, extra fingers, repetitive motion, looping animation, identical repeated frames, frozen, motionless, sudden scene change, camera zoom, camera pan, moving background, watermark, text';

    const PRESET_EXAMPLE_BASE = 'assets/presets';
    const DEFAULT_EXAMPLE_BEFORE = [
        'assets/base/base_usuario',
        'pruebas/base_usuario'
    ];

    const QUALITY_PROFILES = {
        draft: {
            id: 'draft',
            baseSize: 832,
            maxSize: 1024,
            enableHr: false,
            hrScale: 1.0
        },
        balanced: {
            id: 'balanced',
            baseSize: 1024,
            maxSize: 1216,
            enableHr: false,
            hrScale: 1.0
        },
        original: {
            id: 'original',
            baseSize: 1024,
            maxSize: 1216,
            enableHr: false,
            hrScale: 1.0
        }
    };

    const VIDEO_DURATIONS = {
        5: { seconds: 5, fps: 16, frames: 80, estimatedGpuTime: '~45 seg (1 segmento Wan)' },
        10: { seconds: 10, fps: 16, frames: 160, estimatedGpuTime: '~90 seg (2 segmentos Wan)' },
        20: { seconds: 20, fps: 16, frames: 320, estimatedGpuTime: '~3 min (4 segmentos Wan)' }
    };

    const PRESETS = [
        // =====================================================================
        // 5 PRESETS DE FOTO CON LUSTIFY SDXL INPAINTING + CONTROLNET POSE
        // =====================================================================
        {
            id: 'img-realism',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            name: '1. Undress Completo / Nude Natural +18',
            badge: 'Lustify Inpaint +18',
            beforeDesc: 'Persona con ropa original',
            afterDesc: 'Quita toda la ropa generando anatomía desnuda explícita sin cambiar cara ni pose',
            prompt: 'photorealistic fully nude woman, same seated pose, same body position and camera framing, empty hands resting naturally, completely naked, bare breasts, natural nipples and areolae, bare abdomen and navel, exposed vulva, bare legs and bare feet, natural skin texture, soft natural lighting, uncensored',
            negativePrompt: NUDE_NEGATIVE_PROMPT,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#f59e0b'
        },
        {
            id: 'img-topless',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            name: '2. Topless / Descubrir Pecho +18',
            badge: 'Solo Blusa/Top',
            beforeDesc: 'Blusa, top o sostén puesto',
            afterDesc: 'Quita únicamente la prenda superior dejando pechos al descubierto',
            prompt: 'photorealistic topless woman, same pose, same body position and camera framing, empty hands resting naturally, completely bare chest, both breasts fully uncovered, natural breast shape and weight, detailed nipples and areolae, wearing the same lower-body clothing and the same outer garment only around the arms, no bra, no straps, realistic skin pores, soft natural lighting, uncensored',
            negativePrompt: `clothes on breasts, covered breasts, covered nipples, bra, bikini, straps, bad anatomy, extra limbs, extra fingers, missing fingers, deformed hands, distorted torso, ${POSE_PRESERVE_NEGATIVE}, camera, phone, tripod, object in hands, blurry, lowres, worst quality, watermark`,
            steps: 30,
            cfg: 5.5,
            denoise: 1.0,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#ec4899'
        },
        {
            id: 'img-outfit',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            name: '3. Lencería Transparente / Encaje Sensual',
            badge: 'See-Through +18',
            beforeDesc: 'Ropa original de la foto',
            afterDesc: 'Lencería de encaje transparente con pecho visible manteniendo cara y pose',
            prompt: 'photorealistic boudoir photo, same seated pose, same body position and camera framing, woman wearing sheer see-through black lace bra and matching sheer lace thong, nipples and areolae visible through translucent lace, bare stomach and legs, realistic fabric texture, soft natural lighting, uncensored',
            negativePrompt: `opaque clothing, full coverage bra, covered nipples, dress, pants, shirt, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#8b5cf6'
        },
        {
            id: 'img-pose',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            name: '4. Micro Bikini de Hilo / Underboob +18',
            badge: 'Micro Bikini',
            beforeDesc: 'Ropa casual cerrada',
            afterDesc: 'Micro bikini mínimo mostrando piel y escote pronunciado',
            prompt: 'photorealistic woman, same seated pose, same body position and camera framing, wearing a tiny micro string bikini, thin side straps, underboob, deep cleavage, mostly bare breasts, bare stomach and navel, realistic skin texture and pores, natural lighting, uncensored',
            negativePrompt: `one-piece swimsuit, full coverage bikini, opaque clothes, dress, pants, shirt, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#3b82f6'
        },
        {
            id: 'img-upscale',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            name: '5. Camisa Abierta / Pecho Expuesto +18',
            badge: 'Prenda Abierta',
            beforeDesc: 'Prenda superior cerrada',
            afterDesc: 'Camisa desabrochada mostrando el pecho desnudo y pezones',
            prompt: 'photorealistic woman, same pose, same body position and camera framing, wearing the same shirt completely open to the waist and pulled fully to both sides, both breasts fully uncovered, natural breast shape, detailed nipples and areolae, bare cleavage and stomach, loose shirt fabric only around shoulders and arms, realistic skin texture, natural lighting, uncensored',
            negativePrompt: `closed shirt, fastened buttons, covered breasts, covered nipples, bra, bikini, straps, clothing between breasts, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 6.0,
            denoise: 1.0,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#10b981'
        },
        {
            id: 'img-enhance',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'enhance',
            name: '6. Ultra Realista / Restaurar Foto',
            badge: 'SDXL Enhance',
            beforeDesc: 'Foto con grano, compresión o luz irregular',
            afterDesc: 'Restauración fotorrealista conservando rasgos, pose y entorno',
            prompt: 'ultra detailed photorealistic restoration of the exact same photo, exact same person, identical face and facial features, identical body shape, identical pose and composition, realistic skin pores and texture, perfectly clean image, zero visible grain, remove compression and jpeg artifacts, clean sharp focus, balanced natural lighting, subtle exposure correction only where needed, high-end camera quality',
            negativePrompt: ENHANCE_NEGATIVE_PROMPT,
            steps: 32,
            cfg: 4.5,
            denoise: 0.36,
            detailRestore: 0.50,
            colorRestore: 0.95,
            loraScale: 0.0,
            seed: 23,
            themeColor: '#f97316'
        },

        // =====================================================================
        // 5 PRESETS DE VIDEO WAN 2.1 I2V CON LORAS REALES DE CIVITAI (CÁMARA FIJA)
        // =====================================================================
        {
            id: 'vid-breathing',
            category: 'video',
            mode: 'img2vid',
            loraId: 'str1p',
            name: '7. Quitarse el Top / Striptease Topless',
            badge: 'LoRA: str1p v1',
            beforeDesc: 'Foto en top, bikini o lencería',
            afterDesc: 'Se quita la prenda superior mostrando el pecho desnudo (cámara fija)',
            prompt: 'str1p. The woman starts fully clothed, looks at the camera, slowly lifts her top and takes it off, revealing her bare breasts. She finishes topless with a natural smile and gentle movement. Sexy video, uncensored, static camera, no camera movement. str1p',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#06b6d4',
            motionStyle: 'breathing'
        },
        {
            id: 'vid-camera',
            category: 'video',
            mode: 'img2vid',
            loraId: 'tittydrop',
            name: '8. Descubrir Pecho / Titty Drop +18',
            badge: 'LoRA: TittyDrop I2V',
            beforeDesc: 'Foto con blusa o sostén',
            afterDesc: 'Levanta o baja su blusa revelando el pecho con física real (cámara fija)',
            prompt: 'tittydrop. The woman starts with her top down, then pulls it up to reveal her bare breasts, lets them drop naturally with realistic bounce and physics, then smiles at the camera. Static camera, no zoom, realistic skin texture, uncensored. tittydrop',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#6366f1',
            motionStyle: 'wind'
        },
        {
            id: 'vid-turn',
            category: 'video',
            mode: 'img2vid',
            loraId: 'clothes_on_off',
            name: '9. Transición Con Ropa a Desnuda +18',
            badge: 'LoRA: Clothes On/Off',
            beforeDesc: 'Foto con ropa normal',
            afterDesc: 'Cubre la lente con la mano y al quitarla aparece completamente desnuda',
            prompt: 'clothes_on_off. The video starts with the woman fully clothed. She reaches toward the lens and covers the view with her hand. When she removes her hand she is completely naked in the same pose and background, showing bare breasts and vulva. Static camera, no zoom, realistic detail, HD. clothes_on_off',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#d946ef',
            motionStyle: 'turn'
        },
        {
            id: 'vid-wind',
            category: 'video',
            mode: 'img2vid',
            loraId: 'bounce',
            name: '10. Nude Artístico: Rebote y Física Corporal',
            badge: 'LoRA: Action Bounce',
            beforeDesc: 'Foto desnuda o en lencería',
            afterDesc: 'Movimiento rítmico del cuerpo y rebote natural de pecho sin mover cámara',
            prompt: 'bounce. A nude woman poses seductively, gently shifting her hips and bouncing naturally, breasts moving with realistic soft-body physics, alluring smile looking at viewer, static camera, locked tripod shot, realistic skin detail, uncensored. bounce',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#14b8a6',
            motionStyle: 'loop'
        },
        {
            id: 'vid-loop',
            category: 'video',
            mode: 'img2vid',
            loraId: 'boob_grab',
            name: '11. Nude Artístico: Caricia Sensual de Pecho',
            badge: 'LoRA: Fondling I2V',
            beforeDesc: 'Foto en topless o lencería',
            afterDesc: 'Acaricia y sostiene su pecho con expresión sensual manteniendo cámara fija',
            prompt: 'boob_grab. A pretty woman smiles at the viewer, bare breasts moving naturally while her hands gently lift, squeeze and fondle them, seductive expression, static camera, no camera movement, realistic skin pores and lighting, uncensored. boob_grab',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#f43f5e',
            motionStyle: 'breathing'
        }
    ];

    PRESETS.forEach((preset) => {
        const categoryDir = preset.category === 'video' ? 'video' : 'image';
        const presetDir = `${PRESET_EXAMPLE_BASE}/${categoryDir}/${preset.id}`;
        preset.exampleBefore = `${presetDir}/before`;
        preset.exampleAfter = `${presetDir}/after`;
        if (preset.category === 'video') {
            preset.videoPreviews = {
                5: `${presetDir}/preview-5s`,
                10: `${presetDir}/preview-10s`,
                20: `${presetDir}/preview-20s`
            };
        }
    });

    StudioAI.Config = {
        DEFAULT_NEGATIVE_PROMPT,
        DEFAULT_EXAMPLE_BEFORE,
        QUALITY_PROFILES,
        VIDEO_DURATIONS,
        PRESETS,
        getPresetById(id) {
            return PRESETS.find((p) => p.id === id) || null;
        }
    };
})(window);
