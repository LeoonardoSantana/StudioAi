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
        'bad anatomy, extra limbs, extra fingers, missing fingers, deformed hands, distorted torso, extra breasts, cut arms, camera, phone, tripod, object in hands, holding object, device, prop, blurry, lowres, worst quality, low quality, watermark, signature';
    const DEFAULT_NEGATIVE_PROMPT = `${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;
    const NUDE_NEGATIVE_PROMPT =
        `clothes, clothing, shirt, t-shirt, top, dress, pants, leggings, jeans, shoes, footwear, socks, bra, bikini, underwear, panties, fabric, sleeves, collar, waistband, covered breasts, covered nipples, covered legs, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;
    const TOPLESS_NEGATIVE_PROMPT =
        `shirt, t-shirt, top, bra, bikini, bikini top, swimsuit, swimwear, straps, covered breasts, covered nipples, closed cleavage, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`;
    const ENHANCE_NEGATIVE_PROMPT =
        `different face, changed facial features, different person, changed identity, beautified face, face morph, changed body shape, changed pose, changed camera angle, altered background, new objects, camera, tripod, plastic skin, airbrushed, oversharpened, halo, cartoon, painting, illustration, grain, noise, jpeg artifacts, blur, overexposed, underexposed, watermark, text, signature`;
    const WAN_NEGATIVE_PROMPT =
        'lowres, blurry, overexposed, worst quality, low quality, deformed, distorted anatomy, morphing face, changing identity, extra limbs, extra fingers, repetitive motion, looping animation, identical repeated frames, frozen, motionless, sudden scene change, camera zoom, camera pan, moving background, watermark, text, changed expression, different facial expression, exaggerated motion, cartoon physics, rubber body';
    const PRESET_EXAMPLE_BASE = 'assets/presets';
    const DEFAULT_EXAMPLE_BEFORE = [
        'assets/base/base_usuario',
        'pruebas/base_usuario'
    ];
    const VIDEO_DURATIONS = {
        5: { seconds: 5, fps: 16, frames: 80, estimatedGpuTime: '~45 seg (1 segmento Wan)' },
        10: { seconds: 10, fps: 16, frames: 160, estimatedGpuTime: '~90 seg (2 segmentos Wan)' },
        20: { seconds: 20, fps: 16, frames: 320, estimatedGpuTime: '~3 min (4 segmentos Wan)' }
    };
    const PRESETS = [
        // =====================================================================
        // 7 PRESETS DE FOTO CON LUSTIFY SDXL INPAINTING + CONTROLNET POSE
        // =====================================================================
        {
            id: 'img-realism',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            refineStrength: 0.3,
            name: '1. Undress Completo / Nude Natural +18',
            badge: 'Lustify Inpaint +18',
            beforeDesc: 'Persona con ropa original',
            afterDesc: 'Quita toda la ropa generando anatomía desnuda explícita sin cambiar cara ni pose',
            prompt: 'photorealistic fully nude woman, same seated pose, same body position and camera framing, empty hands resting naturally, completely naked, full natural breasts, puffy areolae and nipples matching her natural lip color, bare abdomen and navel, exposed vulva, subtle natural pubic hair, bare legs and bare feet, warm golden skin tone, detailed natural skin texture, soft natural lighting, uncensored',
            negativePrompt: NUDE_NEGATIVE_PROMPT,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
            themeColor: '#f59e0b'
        },
        {
            id: 'img-fullbody',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'full_body',
            skinPreAdapt: true,
            preserveLimbs: true,
            blendMode: 'raw',
            refineStrength: 0.3,
            expandBody: true,
            fullBody: true,
            frameScale: 0.62,
            frameAlignX: 0.75,
            controlScale: 1.30,
            outpaintSteps: 30,
            outpaintControlScale: 1.35,
            name: '2. Full Body / Completar Cuerpo +18',
            badge: 'Expand4 + Outpaint',
            beforeDesc: 'Foto recortada o con cuerpo incompleto',
            afterDesc: 'Primero replica el resultado tipo expand4 y luego extiende cadera, muslos y fondo',
            prompt: 'photorealistic fully nude woman, same face identity, same seated pose, same hand near hair, empty hand, same thin necklace and jewelry, completely naked, natural breasts, puffy areolae and nipples matching her natural lip color, long bare abdomen and navel, bare hips and upper thighs visible, subtle natural pubic hair, natural slim body proportions, warm golden skin tone, detailed natural skin texture, soft natural lighting, uncensored',
            negativePrompt: `${NUDE_NEGATIVE_PROMPT}, cropped body, cut off torso, missing hips, missing thighs, missing legs, floating body, disconnected legs, extra person, cloned body`,
            steps: 32,
            cfg: 6.0,
            denoise: 1.0,
            loraScale: 0.0,
            themeColor: '#facc15'
        },
        {
            id: 'img-topless',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'all_clothes',
            skinPreAdapt: false,
            preserveLimbs: true,
            blendMode: 'raw',
            refineStrength: 0.3,
            name: '3. Topless / Descubrir Pecho +18',
            badge: 'Solo Blusa/Top',
            beforeDesc: 'Blusa, top o sostén puesto',
            afterDesc: 'Quita únicamente la prenda superior dejando pechos al descubierto',
            prompt: 'photorealistic topless woman, same pose, same body position and camera framing, empty hands resting naturally, completely bare chest, both breasts fully uncovered, natural breast shape and weight, puffy areolae and nipples matching her natural lip color, wearing the same lower-body clothing and the same outer garment only around the arms, no bra, no straps, warm golden skin tone, realistic skin pores, soft natural lighting, uncensored',
            negativePrompt: `clothes on breasts, covered breasts, covered nipples, bra, bikini, straps, bad anatomy, extra limbs, extra fingers, missing fingers, deformed hands, distorted torso, ${POSE_PRESERVE_NEGATIVE}, camera, phone, tripod, object in hands, blurry, lowres, worst quality, watermark`,
            steps: 30,
            cfg: 5.5,
            denoise: 1.0,
            loraScale: 0.0,
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
            refineStrength: 0.3,
            name: '4. Lencería Transparente / Encaje Sensual',
            badge: 'See-Through +18',
            beforeDesc: 'Ropa original de la foto',
            afterDesc: 'Lencería de encaje transparente con pecho visible manteniendo cara y pose',
            prompt: 'photorealistic boudoir photo, same seated pose, same body position and camera framing, woman wearing sheer see-through black lace bra and matching sheer lace thong, nipples and areolae matching her natural lip color visible through translucent lace, bare stomach and legs, warm golden skin tone, realistic fabric texture, soft natural lighting, uncensored',
            negativePrompt: `opaque clothing, full coverage bra, covered nipples, dress, pants, shirt, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
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
            refineStrength: 0.3,
            name: '5. Micro Bikini de Hilo / Underboob +18',
            badge: 'Micro Bikini',
            beforeDesc: 'Ropa casual cerrada',
            afterDesc: 'Micro bikini mínimo mostrando piel y escote pronunciado',
            prompt: 'photorealistic woman, same seated pose, same body position and camera framing, wearing a tiny micro string bikini, thin side straps, underboob, deep cleavage, mostly bare natural breasts, bare stomach and navel, warm golden skin tone, realistic skin texture and pores, natural lighting, uncensored',
            negativePrompt: `one-piece swimsuit, full coverage bikini, opaque clothes, dress, pants, shirt, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 5.0,
            denoise: 1.0,
            loraScale: 0.0,
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
            refineStrength: 0.3,
            name: '6. Camisa Abierta / Pecho Expuesto +18',
            badge: 'Prenda Abierta',
            beforeDesc: 'Prenda superior cerrada',
            afterDesc: 'Camisa desabrochada mostrando el pecho desnudo y pezones',
            prompt: 'photorealistic woman, same pose, same body position and camera framing, wearing the same shirt completely open to the waist and pulled fully to both sides, both breasts fully uncovered, natural breast shape, puffy areolae and nipples matching her natural lip color, bare cleavage and stomach, loose shirt fabric only around shoulders and arms, warm golden skin tone, realistic skin texture, natural lighting, uncensored',
            negativePrompt: `closed shirt, fastened buttons, covered breasts, covered nipples, bra, bikini, straps, clothing between breasts, ${POSE_PRESERVE_NEGATIVE}, ${ANATOMY_NEGATIVE}`,
            steps: 30,
            cfg: 6.0,
            denoise: 1.0,
            loraScale: 0.0,
            themeColor: '#10b981'
        },
        {
            id: 'img-enhance',
            category: 'image',
            mode: 'img2img',
            maskTarget: 'enhance',
            name: '7. Ultra Realista / Restaurar Foto',
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
            name: '8. Quitarse el Top / Striptease Topless',
            badge: 'LoRA: str1p v1',
            beforeDesc: 'Foto en top, bikini o lencería',
            afterDesc: 'Se quita la prenda superior mostrando el pecho desnudo (cámara fija)',
            prompt: 'str1p. The woman starts fully clothed, looks at the camera, slowly lifts her top and takes it off, revealing her bare breasts. She finishes topless, keeping her exact original facial expression throughout. She stays turned toward the camera the whole time, keeping the same body orientation as the original photo, and ends in a pose very close to her original position. Sexy video, uncensored, static camera, no camera movement. str1p',
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
            name: '9. Descubrir Pecho / Titty Drop +18',
            badge: 'LoRA: TittyDrop I2V',
            beforeDesc: 'Foto con blusa o sostén',
            afterDesc: 'Levanta o baja su blusa revelando el pecho con física real (cámara fija)',
            prompt: 'tittydrop. The woman starts with her top down, then pulls it up to reveal her bare breasts, lets them drop naturally with realistic bounce and physics, keeping her exact original facial expression throughout. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom, realistic skin texture, uncensored. tittydrop',
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
            name: '10. Transición Con Ropa a Desnuda +18',
            badge: 'LoRA: Clothes On/Off',
            beforeDesc: 'Foto con ropa normal',
            afterDesc: 'Cubre la lente con la mano y al quitarla aparece completamente desnuda',
            prompt: 'clothes_on_off. The video starts with the woman fully clothed. She reaches toward the lens and covers the view with her hand. When she removes her hand she is completely naked in the same pose and background, showing bare breasts and vulva. She keeps her exact original facial expression throughout, stays turned toward the camera the whole time, and ends in a pose very close to her original position. Static camera, no zoom, realistic detail, HD. clothes_on_off',
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
            name: '11. Nude Artístico: Rebote y Física Corporal',
            badge: 'LoRA: Action Bounce',
            beforeDesc: 'Foto desnuda o en lencería',
            afterDesc: 'Movimiento rítmico del cuerpo y rebote natural de pecho sin mover cámara',
            prompt: 'bounce. A nude woman stays turned toward the camera throughout, keeping the same body orientation as the original photo, never turning her back. She moves naturally and relaxed, gently shifting her hips with subtle realistic soft-body physics, keeping her exact original facial expression, then settles back into a pose very close to her original position by the last frame. Static camera, locked tripod shot, realistic skin detail, uncensored. bounce',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.70,
            themeColor: '#14b8a6',
            motionStyle: 'loop'
        },
        {
            id: 'vid-loop',
            category: 'video',
            mode: 'img2vid',
            loraId: 'boob_grab',
            name: '12. Nude Artístico: Caricia Sensual de Pecho',
            badge: 'LoRA: Fondling I2V',
            beforeDesc: 'Foto en topless o lencería',
            afterDesc: 'Acaricia y sostiene su pecho con expresión sensual manteniendo cámara fija',
            prompt: 'boob_grab. A pretty woman stays turned toward the camera throughout, keeping the same body orientation as the original photo, never turning her back. She slowly and sensually caresses her bare breasts, teasing gentle squeezing motions, biting her lower lip with half-closed eyes, keeping her original face identity and expression, seductive slow motion, ending in a pose very close to her original position by the last frame, static camera, no camera movement, realistic skin pores and lighting, uncensored. boob_grab',
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#f43f5e',
            motionStyle: 'breathing'
        },
        {
            id: 'vid-chain-nude-bounce',
            category: 'video',
            mode: 'img2vid',
            loraId: null,
            name: '13. Desnuda + Rebote Natural (Cadena 10s)',
            badge: 'Cadena: On/Off → Bounce',
            beforeDesc: 'Foto con ropa normal',
            afterDesc: 'Primero queda desnuda (misma cara) y luego rebote natural suave — video único fluido',
            prompt: 'undress then gentle natural bounce',
            chain: [
                {
                    loraId: 'clothes_on_off',
                    loraScale: 0.85,
                    prompt: 'clothes_on_off. The video starts with the woman fully clothed. She reaches toward the lens and covers the view with her hand. When she removes her hand she is completely naked in the same pose and background, showing bare breasts and vulva. She keeps her exact original facial expression throughout, stays turned toward the camera the whole time, and ends in a pose very close to her original position. Static camera, no zoom, realistic detail, HD. clothes_on_off'
                },
                {
                    loraId: 'bounce',
                    loraScale: 0.70,
                    prompt: 'bounce. A nude woman stays turned toward the camera throughout, keeping the same body orientation as the original photo, never turning her back. She moves naturally and relaxed, gently shifting her hips with subtle realistic soft-body physics, keeping her exact original facial expression, then settles back into a pose very close to her original position by the last frame. Static camera, locked tripod shot, realistic skin detail, uncensored. bounce'
                }
            ],
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#d946ef',
            motionStyle: 'loop'
        },
        {
            id: 'vid-chain-nude-fondle',
            category: 'video',
            mode: 'img2vid',
            loraId: null,
            name: '14. Desnuda + Caricia Sensual (Cadena 10s)',
            badge: 'Cadena: On/Off → Fondle',
            beforeDesc: 'Foto con ropa normal',
            afterDesc: 'Primero queda desnuda (misma cara) y luego caricia sensual — video único fluido',
            prompt: 'undress then sensual breast caress',
            chain: [
                {
                    loraId: 'clothes_on_off',
                    loraScale: 0.85,
                    prompt: 'clothes_on_off. The video starts with the woman fully clothed. She reaches toward the lens and covers the view with her hand. When she removes her hand she is completely naked in the same pose and background, showing bare breasts and vulva. She keeps her exact original facial expression throughout, stays turned toward the camera the whole time, and ends in a pose very close to her original position. Static camera, no zoom, realistic detail, HD. clothes_on_off'
                },
                {
                    loraId: 'boob_grab',
                    loraScale: 0.85,
                    prompt: 'boob_grab. A pretty woman stays turned toward the camera throughout, keeping the same body orientation as the original photo, never turning her back. She slowly and sensually caresses her bare breasts, teasing gentle squeezing motions, biting her lower lip with half-closed eyes, keeping her original face identity and expression, seductive slow motion, ending in a pose very close to her original position by the last frame, static camera, no camera movement, realistic skin pores and lighting, uncensored. boob_grab'
                }
            ],
            negativePrompt: WAN_NEGATIVE_PROMPT,
            steps: 6,
            cfg: 1.0,
            denoise: 1.0,
            loraScale: 0.85,
            themeColor: '#f43f5e',
            motionStyle: 'breathing'
        },
    ];
    // =====================================================================
    // PRESETS EXTRA DE VIDEO (WAN 2.1 I2V) — GENERADOS DESDE LA BIBLIOTECA
    // DE LORAS DEL BACKEND. Formato compacto: se expanden con los defaults.
    // =====================================================================
    const VIDEO_LORA_DEFAULTS = {
        category: 'video',
        mode: 'img2vid',
        negativePrompt: WAN_NEGATIVE_PROMPT,
        steps: 6,
        cfg: 1.0,
        denoise: 1.0,
        loraScale: 0.85
    };
    const EXTRA_VIDEO_PRESETS = [
        {
            id: 'vid-outfit-change', loraId: 'outfit_change',
            name: 'Cambio Súbito de Outfit', badge: 'LoRA: Outfit Change',
            beforeDesc: 'Foto con cualquier ropa',
            afterDesc: 'Cambia de outfit de golpe a mitad del video (cámara fija)',
            prompt: 'The woman is posing for the camera in her outfit, then a sudden outfit change into sexy black lace lingerie, she keeps posing and smiling naturally. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#8b5cf6', motionStyle: 'turn'
        },
        {
            id: 'vid-rip', loraId: 'rip_shura',
            name: 'Rasgar la Ropa +18', badge: 'LoRA: rip-shura',
            beforeDesc: 'Foto con top, bodysuit o leggings',
            afterDesc: 'Se rasga la ropa de forma dramática exponiendo el cuerpo',
            prompt: 'Medium shot, the woman stands facing the camera, then rips her clothes open with both hands exposing her bare breasts and body. Aggressive dramatic undressing, rip her clothes keeping her exact original facial expression. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#ef4444', motionStyle: 'turn'
        },
        {
            id: 'vid-pulldown', loraId: 'pulldown_shura',
            name: 'Bajarse la Ropa +18', badge: 'LoRA: Pull-down',
            beforeDesc: 'Foto con top o pantalón',
            afterDesc: 'Baja su ropa lentamente hasta quedar desnuda',
            prompt: 'The woman slowly pulls down her top and then her pants, sliding the fabric down her legs revealing her fully nude body. Smooth natural undressing motion keeping her exact original facial expression. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#f97316', motionStyle: 'turn'
        },
        {
            id: 'vid-before-after', loraId: 'before_after',
            name: 'Antes y Después: Desnuda +18', badge: 'LoRA: Before/After',
            beforeDesc: 'Foto con ropa normal',
            afterDesc: 'Transición directa de vestida a desnuda en la misma pose',
            prompt: 'before and after transformation, person wears casual clothes. The woman starts fully clothed, then transforms to completely nude in the exact same pose and background, bare breasts and vulva visible keeping her exact original facial expression. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#0ea5e9', motionStyle: 'turn'
        },
        {
            id: 'vid-undress', loraId: 'woman_undressing',
            name: 'Desnudarse por Completo +18', badge: 'LoRA: Undressing',
            beforeDesc: 'Foto con ropa',
            afterDesc: 'Se quita la ropa pieza por pieza hasta quedar desnuda',
            prompt: 'The woman slowly undresses herself piece by piece until she is fully nude, natural motion, keeping her exact original facial expression throughout. She stays turned toward the camera the whole time and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#ec4899', motionStyle: 'turn'
        },
        {
            id: 'vid-tittydrop-t2v', loraId: 'tittydrop_t2v',
            name: 'Titty Drop Alternativo +18', badge: 'LoRA: TittyDrop v2',
            beforeDesc: 'Foto con blusa o sostén',
            afterDesc: 'Revela el pecho con caída natural (versión alternativa)',
            prompt: 'The woman lifts her top to reveal her bare breasts letting them drop naturally with realistic bounce. She keeps her exact original facial expression, stays turned toward the camera the whole time, and ends in a pose very close to her original position. Static camera, no zoom.',
            themeColor: '#6366f1', motionStyle: 'wind'
        },
                                {
            id: 'vid-orgasm', loraId: 'orgasm_i2v',
            name: 'Orgasmo Intenso +18', badge: 'LoRA: Orgasm I2V',
            beforeDesc: 'Foto desnuda o en acto',
            afterDesc: 'Expresión de orgasmo con temblor corporal',
            prompt: 'The woman experiences an intense orgasm, her body trembling, back arching, moaning with an expression of pure ecstasy. Static camera, no zoom.',
            themeColor: '#e11d48', motionStyle: 'breathing'
        },
                        {
            id: 'vid-orgasm-t2v', loraId: 'orgasm_t2v',
            name: 'Orgasmo Alternativo +18', badge: 'LoRA: Orgasm v2 T2V',
            beforeDesc: 'Foto desnuda',
            afterDesc: 'Variante de orgasmo entrenada en T2V',
            prompt: 'Intense orgasm, the woman moaning loudly, body shaking with waves of pleasure, eyes rolling. Static camera, no zoom.',
            themeColor: '#9f1239', motionStyle: 'breathing'
        },
                        {
            id: 'vid-squirt', loraId: 'squirt_i2v',
            name: 'Squirting +18', badge: 'LoRA: Squirt I2V',
            beforeDesc: 'Foto desnuda',
            afterDesc: 'Eyaculación femenina durante el clímax',
            prompt: 'The woman masturbating intensely, then squirting during orgasm, body convulsing with pleasure. Static camera, no zoom.',
            themeColor: '#06b6d4', motionStyle: 'loop'
        },
        {
            id: 'vid-jelly-hips', loraId: 'jelly_hips',
            name: 'Caderas con Física Suave', badge: 'LoRA: Jelly Hips',
            beforeDesc: 'Foto de pie o de cuerpo completo',
            afterDesc: 'Mueve las caderas con rebote suave de piel',
            prompt: 'The woman standing and swaying her hips side to side with soft body jiggle physics, seductive slow dance, bare skin moving naturally. Static camera, no zoom.',
            themeColor: '#14b8a6', motionStyle: 'loop'
        },
        {
            id: 'vid-fingering', loraId: 'fingering',
            name: 'Masturbación con Dedos +18', badge: 'LoRA: Fingering I2V',
            beforeDesc: 'Foto desnuda o semidesnuda',
            afterDesc: 'Se toca íntimamente con expresión de placer',
            prompt: 'The woman pleasuring herself, hand between her legs fingering slowly, moaning with closed eyes, sensual solo motion. Static camera, no zoom.',
            themeColor: '#f472b6', motionStyle: 'breathing'
        },
                {
            id: 'vid-solo-fem', loraId: 'female_masturbation',
            name: 'Masturbación Femenina +18', badge: 'LoRA: Solo Female',
            beforeDesc: 'Foto desnuda o reclinada',
            afterDesc: 'Se masturba sola hasta el clímax',
            prompt: 'The woman masturbating alone, fingers circling between her legs, hips moving, eyes half closed with pleasure. Static camera, no zoom.',
            themeColor: '#f0abfc', motionStyle: 'breathing'
        },
                                        {
            id: 'vid-squirt-shura', loraId: 'squirt_shura',
            name: 'Squirting (shura) +18', badge: 'LoRA: Squirt v2',
            beforeDesc: 'Foto desnuda',
            afterDesc: 'Variante de squirting estilo shura',
            prompt: 'The woman masturbating rapidly then squirting hard, liquid spraying during climax. Static camera, no zoom.',
            themeColor: '#38bdf8', motionStyle: 'loop'
        },
        {
            id: 'vid-lactate', loraId: 'lactate_shura',
            name: 'Lactancia +18', badge: 'LoRA: Lactating',
            beforeDesc: 'Foto con pecho descubierto',
            afterDesc: 'Los pezones expulsan leche al presionar',
            prompt: 'The woman squeezing her bare breasts, milk spraying from her nipples, lactating motion. Static camera, no zoom.',
            themeColor: '#f8fafc', motionStyle: 'breathing'
        },
                {
            id: 'vid-hand-panties', loraId: 'hand_panties',
            name: 'Mano en las Bragas +18', badge: 'LoRA: Hand in Panties',
            beforeDesc: 'Foto con bragas visibles',
            afterDesc: 'Mete la mano dentro de las bragas',
            prompt: 'The woman sliding her hand inside her panties, touching herself, subtle sensual motion, biting her lip. Static camera, no zoom.',
            themeColor: '#e879f9', motionStyle: 'breathing'
        },
                                        {
            id: 'vid-ahegao', loraId: 'ahegao',
            name: 'Cara Ahegao +18', badge: 'LoRA: Ahegao',
            beforeDesc: 'Foto de rostro',
            afterDesc: 'Expresión ahegao: ojos en blanco y lengua fuera',
            prompt: 'Ahegao face, eyes rolling back, tongue sticking out, expression of overwhelming pleasure. Static camera, no zoom.',
            themeColor: '#c084fc', motionStyle: 'breathing'
        },
                                        {
            id: 'vid-two-fingers', loraId: 'two_fingers',
            name: 'Dos Dedos +18', badge: 'LoRA: Two Fingers',
            beforeDesc: 'Foto desnuda',
            afterDesc: 'Penetración con dos dedos',
            prompt: 'Two fingers sliding in and out, fingering motion, wet close-up detail. Static camera, no zoom.',
            themeColor: '#f472b6', motionStyle: 'breathing'
        },
        {
            id: 'vid-genitals', loraId: 'genitals_helper',
            name: 'Detalle Genital +18', badge: 'LoRA: Genitals Helper',
            beforeDesc: 'Cualquier foto del acto',
            afterDesc: 'Mejora el detalle anatómico genital del video',
            prompt: 'Detailed realistic genitals, anatomically correct vulva and penis, close detail, natural motion. Static camera, no zoom.',
            themeColor: '#fda4af', motionStyle: 'breathing'
        },
        {
            id: 'vid-walk-back', loraId: 'walking_back',
            name: 'Caminar de Espaldas', badge: 'LoRA: Walking Back',
            beforeDesc: 'Foto de pie',
            afterDesc: 'Se gira y camina alejándose de espaldas',
            prompt: 'The woman turns around and walks away from the camera showing her back, natural walking motion, hips swaying. Static camera, no zoom.',
            themeColor: '#22d3ee', motionStyle: 'turn'
        },
        {
            id: 'vid-dogeza', loraId: 'dogeza',
            name: 'Reverencia Dogeza', badge: 'LoRA: Dogeza',
            beforeDesc: 'Foto de pie o arrodillada',
            afterDesc: 'Se inclina en reverencia profunda',
            prompt: 'The woman kneeling down into a deep dogeza bow, forehead to the floor, submissive pose. Static camera, no zoom.',
            themeColor: '#eab308', motionStyle: 'turn'
        },
        {
            id: 'vid-forward-bends', loraId: 'forward_bends',
            name: 'Inclinación con Rebote', badge: 'LoRA: Fwd Bends',
            beforeDesc: 'Foto de pie',
            afterDesc: 'Se inclina al frente con rebote de pecho',
            prompt: 'The woman bending forward repeatedly, her breasts bouncing with each bend, playful motion. Static camera, no zoom.',
            themeColor: '#34d399', motionStyle: 'loop'
        },
                {
            id: 'vid-hand-panties-v3', loraId: 'hand_panties_v3',
            name: 'Mano en Bragas v3 +18', badge: 'LoRA: Panties v3',
            beforeDesc: 'Foto con bragas',
            afterDesc: 'Variante v3 de mano dentro de las bragas',
            prompt: 'Her hand slips inside her panties rubbing herself slowly, sensual expression. Static camera, no zoom.',
            themeColor: '#d946ef', motionStyle: 'breathing'
        },
        {
            id: 'vid-kiss-you', loraId: 'kiss_you',
            name: 'Beso a la Cámara', badge: 'LoRA: Kiss You',
            beforeDesc: 'Foto de rostro',
            afterDesc: 'Se acerca y besa la lente',
            prompt: 'The woman leans toward the camera and kisses the lens, blowing a kiss, lips close-up. Static camera, no zoom.',
            themeColor: '#f87171', motionStyle: 'breathing'
        },
                {
            id: 'vid-innie', loraId: 'innie_pussy_t2v',
            name: 'Primer Plano Íntimo +18', badge: 'LoRA: Innie T2V',
            beforeDesc: 'Foto con piernas abiertas',
            afterDesc: 'Primer plano detallado de la vulva',
            prompt: 'Close-up of a smooth innie pussy, labia detail, slight natural movement. Static camera, no zoom.',
            themeColor: '#fbcfe8', motionStyle: 'breathing'
        }
    ];
    EXTRA_VIDEO_PRESETS.forEach((cfg, idx) => {
        PRESETS.push(Object.assign({}, VIDEO_LORA_DEFAULTS, cfg, {
            name: `${13 + idx}. ${cfg.name}`
        }));
    });
    // Preset final totalmente personalizable (prompt libre + LoRA a elección)
    PRESETS.push(Object.assign({}, VIDEO_LORA_DEFAULTS, {
        id: 'vid-custom',
        loraId: null,
        customLoraSelectable: true,
        name: `${13 + EXTRA_VIDEO_PRESETS.length}. ✨ Personalizado (Prompt Libre)`,
        badge: 'Wan 2.1 Custom',
        beforeDesc: 'Cualquier foto',
        afterDesc: 'Video según tu propio prompt con el LoRA que elijas',
        prompt: 'The woman poses naturally for the camera, gentle sensual movement, looking at the viewer. Static camera, no zoom.',
        themeColor: '#facc15',
        motionStyle: 'breathing'
    }));
    // =====================================================================
    // DESCRIPCIONES, CONSEJOS DE POSE Y CLASIFICACIÓN POR TIPO DE ENTRADA
    // inputType: 'undress' (acepta ropa y genera desnudo),
    //            'nude' (necesita desnudo/acción previa, solo anima),
    //            'any'   (funciona con cualquier foto)
    // previewLink: URL externa (Drive) con un GIF/video de muestra real
    // =====================================================================
    const PRESET_DETAILS = {
        'img-realism': {
            desc: 'Desnuda completamente a la persona conservando rostro, pose y fondo.',
            tips: 'Foto de medio cuerpo o cuerpo completo, persona centrada con buena luz.'
        },
        'img-fullbody': {
            desc: 'Expande la foto hacia abajo completando cadera, muslos y piernas, y la desnuda.',
            tips: 'Ideal con fotos cortadas a la cintura o muslos; no uses encuadres de solo rostro.'
        },
        'img-topless': {
            desc: 'Quita solo la parte de arriba dejando el pecho descubierto, conserva la ropa de abajo.',
            tips: 'Medio cuerpo con top, blusa o bikini visibles.'
        },
        'img-outfit': {
            desc: 'Cambia la ropa por lencería de encaje transparente.',
            tips: 'Funciona con cualquier prenda; mejor si es ajustada al cuerpo.'
        },
        'img-pose': {
            desc: 'Viste un micro bikini de hilo que apenas cubre nada.',
            tips: 'Cuerpo completo o medio cuerpo, de pie o sentada.'
        },
        'img-upscale': {
            desc: 'Abre la camisa o blusa exponiendo el pecho.',
            tips: 'Fotos con camisa, blusa o chaqueta; mejor si tiene botones.'
        },
        'img-enhance': {
            desc: 'Restaura la foto sin desnudar: quita grano y mejora nitidez.',
            tips: 'Cualquier foto con ruido, mala luz o compresión.'
        },
        'vid-breathing': {
            desc: 'Se quita la parte de arriba y queda en topless frente a cámara.',
            tips: 'Foto con top o camiseta puesta, medio cuerpo, mirando a cámara.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/12-17DT9Lh2fIDT997z1vr9WasInzCx98/preview'
        },
        'vid-camera': {
            desc: 'Sube la blusa y deja caer el pecho con rebote físico realista.',
            tips: 'Blusa o sostén cubriendo el pecho; encuadre de cintura hacia arriba.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1yLJldcCBDzOF6wB2VNpn1vkR24zcT56A/preview'
        },
        'vid-turn': {
            desc: 'Cubre la lente con la mano y al quitarla aparece completamente desnuda.',
            tips: 'Cuerpo completo o medio cuerpo; funciona con cualquier ropa.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1VxLPd5en9zdOhDpFoApX05sRqbqr1Ci8/preview'
        },
        'vid-wind': {
            desc: 'Balanceo sensual del cuerpo con rebote natural del pecho.',
            tips: 'Necesita foto ya desnuda o con lencería mínima; no quita ropa.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1ScJIdFbMB0HCz04CLhMy_Ei92di1Dq-A/preview'
        },
        'vid-loop': {
            desc: 'Se agarra y aprieta el pecho con sus propias manos.',
            tips: 'Pecho visible (topless o desnuda), medio cuerpo.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1_d2Y0kZ-8x5PiwmJqrnV3-ET5iOarIHD/preview'
        },
        'vid-outfit-change': {
            desc: 'Cambia de golpe su outfit por lencería sexy a mitad del video.',
            tips: 'Cualquier ropa; cuerpo completo da el mejor efecto.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1r7370D894Xxaeziv2C9-BCf72aEZBiKx/preview'
        },
        'vid-rip': {
            desc: 'Se rasga la ropa de forma agresiva exponiendo su cuerpo.',
            tips: 'Top, bodysuit o leggings; ropa ajustada funciona mejor.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1_2rXLugbQsLBiFeFqVB_KbSpOF9ixyAd/preview'
        },
        'vid-pulldown': {
            desc: 'Baja su top y pantalón lentamente hasta quedar desnuda.',
            tips: 'Foto con top y pantalón o falda; medio cuerpo o cuerpo completo.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1dgkCTqQJ9EnnvrlP3jJety6P3nmM9DQ5/preview'
        },
        'vid-before-after': {
            desc: 'Transición directa de vestida a desnuda en la misma pose.',
            tips: 'Pose clara de cuerpo completo con fondo simple.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1HSBRGtqyTQEOfRHgtPipH48Qsn-Xw2w2/preview'
        },
        'vid-undress': {
            desc: 'Se desviste pieza por pieza hasta quedar completamente nude.',
            tips: 'Mejor con varias prendas puestas; distancia media.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1WEdKobbjFJie7GLeZmBcRLcdtCXEWtQp/preview'
        },
        'vid-tittydrop-t2v': {
            desc: 'Variante alternativa de levantar la blusa y soltar el pecho.',
            tips: 'Blusa cubriendo el pecho; encuadre de cintura hacia arriba.',
            inputType: 'undress', previewLink: 'https://drive.google.com/file/d/1x7Rp21I8IOWBnQs4gryV4OTR8_qX3iOI/preview'
        },
        'vid-orgasm': {
            desc: 'Orgasmo intenso con temblor corporal y expresión de éxtasis.',
            tips: 'Funciona mejor con foto desnuda en el acto; con ropa solo simula expresión.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1LneGZ9RXRiATFi77z_o8AAyeUk_pl_X6/preview'
        },
        'vid-orgasm-t2v': {
            desc: 'Variante de orgasmo (entrenado en T2V).',
            tips: 'Funciona mejor con foto desnuda en el acto.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1SGcxZtJELpwXgL73aenByd_Lw346N0R_/preview'
        },
        'vid-squirt': {
            desc: 'Eyaculación femenina visible durante el clímax.',
            tips: 'Funciona mejor con foto desnuda masturbándose ya en la escena.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1R-DY8lHl_oDh0W9tqJ8FoEEoD6hx9rUJ/preview'
        },
        'vid-jelly-hips': {
            desc: 'Mueve las caderas de lado a lado con rebote suave de piel.',
            tips: 'De pie, cuerpo completo; funciona con ropa pero mejor desnuda.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/1l829rcMXhRveZJ9pVdYBzytmTcdZX8T7/preview'
        },
        'vid-fingering': {
            desc: 'Se masturba metiéndose los dedos con expresión de placer.',
            tips: 'Funciona mejor con mano cerca o dentro ya en la foto.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1OIzKPuzDFfXE8jcoUVW73B6guGfee2DA/preview'
        },
        'vid-solo-fem': {
            desc: 'Se masturba sola moviendo las caderas hasta el clímax.',
            tips: 'Funciona mejor con foto desnuda con la mano en la entrepierna.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1TjA48qH_jdeyiU2Kjocc2NAjZDxaS9JD/preview'
        },
        'vid-squirt-shura': {
            desc: 'Variante alternativa de squirting (estilo shura).',
            tips: 'Funciona mejor con foto desnuda masturbándose ya en la escena.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1SAbN6gm3k2MmG-NFoKVtNlq5gHxyLmu1/preview'
        },
        'vid-lactate': {
            desc: 'Presiona sus pechos y los pezones expulsan leche.',
            tips: 'Requiere pecho desnudo visible.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/11N4dHk6fnLkBJmb0lBu8qU6fAjhHynu9/preview'
        },
        'vid-hand-panties': {
            desc: 'Desliza su mano dentro de las bragas para tocarse.',
            tips: 'Requiere bragas visibles con la mano cerca.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1fwxZuEfeQp_4RxTPgDbLZs0UG27OTPLr/preview'
        },
        'vid-ahegao': {
            desc: 'Cara de placer extremo: ojos en blanco y lengua fuera.',
            tips: 'Primer plano del rostro.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/1hJ7snpemE2m2QDqtap0irIobGpi_v5e6/preview'
        },
        'vid-two-fingers': {
            desc: 'Penetración con dos dedos, detalle húmedo.',
            tips: 'Requiere zona genital visible de cerca.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1ThousB8XUvPct9q65F8JCI1g34jXLaXe/preview'
        },
        'vid-genitals': {
            desc: 'Realza el detalle anatómico genital del video.',
            tips: 'Requiere zona genital visible; mejora detalle, no lo inventa.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1pfsS4z9691b6g02B8pF7TGoMVe0ylwPt/preview'
        },
        'vid-walk-back': {
            desc: 'Se gira y camina alejándose mostrando su espalda.',
            tips: 'De pie con espacio para caminar; funciona con ropa.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/1jyorzCWg6rSTPMBNKtOjRFQRl2MuwMMg/preview'
        },
        'vid-dogeza': {
            desc: 'Se arrodilla en una reverencia profunda de sumisión.',
            tips: 'De pie o de rodillas, cuerpo completo.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/1LtLnWBw7vNmGaYo6gD40qMxCMlMXsTLs/preview'
        },
        'vid-forward-bends': {
            desc: 'Se inclina al frente repetidamente con rebote del pecho.',
            tips: 'De pie de frente; mejor topless o desnuda.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/17GbDuD7PjyaTiynbaW762ADBttUOKRXv/preview'
        },
        'vid-hand-panties-v3': {
            desc: 'Variante v3 de mano dentro de las bragas.',
            tips: 'Requiere bragas visibles con la mano cerca.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1l_E7GPlRXakApMVymDGI6UhQc_i_efJu/preview'
        },
        'vid-kiss-you': {
            desc: 'Se acerca y besa directamente la lente.',
            tips: 'Rostro cerca de la cámara, bien enfocado.',
            inputType: 'any', previewLink: 'https://drive.google.com/file/d/1eez-pa7pAPQYyhCd5iV5MtBuAlPpAKs-/preview'
        },
        'vid-innie': {
            desc: 'Primer plano detallado de la vulva.',
            tips: 'Requiere zona genital visible con piernas abiertas.',
            inputType: 'nude', previewLink: 'https://drive.google.com/file/d/1HumOfRYu4_A0BvO_4wUjq3IbjNjYUZZN/preview'
        },
        'vid-custom': {
            desc: 'Prompt totalmente libre: tú describes la acción y eliges el LoRA.',
            tips: 'Usa el Asistente de Prompt para componer la descripción; el LoRA correcto depende de la acción.',
            inputType: 'any'
        }
    };
    PRESETS.forEach((preset) => {
        const extra = PRESET_DETAILS[preset.id];
        if (extra) Object.assign(preset, extra);
        const categoryDir = preset.category === 'video' ? 'video' : 'image';
        const presetDir = `${PRESET_EXAMPLE_BASE}/${categoryDir}/${preset.id}`;
        preset.exampleBefore = `${presetDir}/before`;
        preset.exampleAfter = `${presetDir}/after`;
    });
    StudioAI.Config = {
        DEFAULT_NEGATIVE_PROMPT,
        DEFAULT_EXAMPLE_BEFORE,
        VIDEO_DURATIONS,
        PRESETS,
        getPresetById(id) {
            return PRESETS.find((p) => p.id === id) || null;
        }
    };
})(window);
