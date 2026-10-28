#!/usr/bin/env python3
"""Pruebas de generación de imagen en Modal (motor Lustify).

Uso:
    python3 tools/test_image_gen.py <nombre_prueba>

Envia un trabajo a /sdapi/v1/job/submit, hace polling hasta
completar y guarda el PNG en pruebas/.
"""
import base64
import json
import sys
import time
import urllib.request

API = "https://leoonardo170--estudio-ia-serverless-api.us-east.modal.run"
IMG_PATH = "/Users/leonardo/Downloads/studioAI/pruebas/reference.JPG"
OUT_DIR = "/Users/leonardo/Downloads/studioAI/pruebas"

NUDE_NEG = (
    "bad anatomy, extra limbs, extra fingers, missing fingers, deformed hands, "
    "distorted torso, extra breasts, cut arms, blurry, lowres, "
    "worst quality, low quality, watermark, text, signature, clothing, bra, panties"
)

TESTS = {
    # Undress completo sobre la foto vestida (equivalente a img-realism)
    "undress": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 23,
    },
    # Undress con cfg alto segun la ficha del modelo (guidance 8.0)
    "undress2": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 28, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True,
        "control_scale": 0.0, "seed": 99,
    },
    # Igual que undress2 pero CON ControlNet (aisla la variable)
    "undress3": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 28, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True,
        "control_scale": 0.95, "seed": 99,
    },
    # Mismo seed 23 del test que fallo, pero con cfg 7 (aisla cfg vs seed)
    "undress4": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 23,
    },
    # Otro seed cualquiera con cfg 7 y control por defecto
    "undress5": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 7,
    },
    # A/B: replica exacta del preset img-realism de la app con seed fija.
    # Uso: python3 tools/test_image_gen.py ab <sufijo>  -> pruebas/test_ab_<sufijo>.png
    "ab": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 5.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 7,
    },
    # Igual que "ab" pero con pase de refinado img2img (A/B seed 7)
    "abrefine": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 5.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 7,
        "refine_strength": 0.3,
    },
    # Igual que "abrefine" pero prompt/negative hacia la anatomía de
    # result.JPG: quita "bad nipples" del negativo (suprime areolas) y
    # describe senos llenos + piel cálida. Seed 7 para comparar directo.
    "abtarget": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "full round breasts, prominent puffy areolae and nipples, "
            "bare abdomen and navel, exposed vulva, bare legs and bare feet, "
            "natural skin tone matching her face, soft rosy undertone, detailed natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": (
            "bad anatomy, extra limbs, extra fingers, missing fingers, "
            "deformed hands, distorted torso, extra breasts, cut arms, "
            "blurry, lowres, worst quality, low quality, watermark, "
            "text, signature, clothing, bra, panties"
        ),
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 5.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 7,
        "refine_strength": 0.3,
    },
    # Objetivo result.JPG: mismo encuadre que reference (sin encoger marco),
    # prompt actual anclado a labios, senos "full natural". A/B de skin_pre_adapt.
    "target": {
        "prompt": (
            "photorealistic fully nude woman, same face identity, same seated pose, "
            "same hand near hair, empty hand, same thin necklace and jewelry, "
            "completely naked, full round breasts, puffy areolae and nipples "
            "matching her natural lip color, bare abdomen and navel, "
            "bare hips and upper thighs visible, smooth bare vulva, "
            "natural slim body proportions, natural skin tone matching her face, soft rosy undertone, "
            "detailed natural skin texture, soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 5.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 47,
        "refine_strength": 0.3, "skin_pre_adapt": True,
    },
    "target_noadapt": {
        "prompt": (
            "photorealistic fully nude woman, same face identity, same seated pose, "
            "same hand near hair, empty hand, same thin necklace and jewelry, "
            "completely naked, full round breasts, puffy areolae and nipples "
            "matching her natural lip color, bare abdomen and navel, "
            "bare hips and upper thighs visible, smooth bare vulva, "
            "natural slim body proportions, natural skin tone matching her face, soft rosy undertone, "
            "detailed natural skin texture, soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 5.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 47,
        "refine_strength": 0.3, "skin_pre_adapt": False,
    },
    # Igual que "ab" pero cfg 7 (aísla si el moteado viene del cfg bajo)
    "ab7": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 7,
    },
    # Solo topless (mask_target upper_clothes si existe; si no, all_clothes)
    "topless": {
        "prompt": (
            "photorealistic topless woman, bare breasts exposed, natural nipples, "
            "same pose and framing, skirt and clothes below waist stay on, "
            "natural skin texture, soft lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 123,
    },
    # Undress con otro seed (123) para medir tasa de fallo
    "undress6": {
        "prompt": (
            "photorealistic fully nude woman, same seated pose, same body position "
            "and camera framing, empty hands resting naturally, completely naked, "
            "bare breasts, natural nipples and areolae, bare abdomen and navel, "
            "exposed vulva, bare legs and bare feet, natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": NUDE_NEG,
        "mask_target": "all_clothes",
        "steps": 30, "cfg_scale": 7.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True, "seed": 123,
    },
    # Restauracion/mejora sin desnudar (mask_target enhance)
    "enhance": {
        "prompt": (
            "photorealistic portrait, same woman, same clothes, same pose, "
            "enhanced detail, sharp focus, natural skin texture, soft lighting"
        ),
        "negative_prompt": (
            "blurry, lowres, worst quality, low quality, watermark, deformed"
        ),
        "mask_target": "enhance",
        "steps": 28, "cfg_scale": 5.0, "denoising_strength": 0.45,
        "seed": 11,
    },
    # Full body expand (equivalente a img-fullbody)
    "fullbody": {
        "prompt": (
            "photorealistic fully nude woman, same face identity, same seated pose, "
            "same hand near hair, empty hand, same thin necklace and jewelry, "
            "completely naked, natural breasts, puffy areolae and nipples "
            "matching her natural lip color, "
            "long bare abdomen and navel, bare hips and upper thighs visible, "
            "subtle natural pubic hair, natural slim body proportions, "
            "warm golden skin tone, detailed natural skin texture, "
            "soft natural lighting, uncensored"
        ),
        "negative_prompt": (
            "bad anatomy, extra limbs, extra fingers, missing fingers, "
            "deformed hands, distorted torso, extra breasts, cut arms, "
            "blurry, lowres, worst quality, low quality, watermark, "
            "text, signature, clothing, bra, panties, "
            "cropped body, cut off torso, missing hips, missing thighs, "
            "missing legs, floating body, disconnected legs, extra person, cloned body"
        ),
        "mask_target": "full_body",
        "steps": 32, "cfg_scale": 6.0, "denoising_strength": 1.0,
        "blend_mode": "raw", "preserve_limbs": True,
        "expand_body": True, "full_body": True,
        "frame_scale": 0.62, "frame_align_x": 0.75, "control_scale": 1.30,
        "skin_pre_adapt": True,
        "outpaint_steps": 30, "outpaint_control_scale": 1.35,
        "refine_strength": 0.3,
        "seed": 42,
    },
}


def post(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={
            "Content-Type": "application/json",
            "Bypass-Tunnel-Reminder": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def billing():
    try:
        return get(f"{API}/sdapi/v1/billing-status")
    except Exception as e:
        return {"error": str(e)}


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "undress"
    if name not in TESTS:
        print("Tests:", ", ".join(TESTS))
        sys.exit(1)
    out_name = f"{name}_{sys.argv[2]}" if len(sys.argv) > 2 else name

    b = billing()
    print(f"[billing] remaining=${b.get('remaining_usd')}")

    with open(IMG_PATH, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    cfg = TESTS[name]
    payload = {
        "prompt": cfg["prompt"],
        "negative_prompt": cfg["negative_prompt"],
        "steps": cfg["steps"],
        "cfg_scale": cfg["cfg_scale"],
        "lora_scale": 0.0,
        "mask_target": cfg["mask_target"],
        "skin_pre_adapt": cfg.get("skin_pre_adapt", False),
        "width": 832,
        "height": 1216,
        "init_images": [f"data:image/jpeg;base64,{b64}"],
    }
    for k in ("denoising_strength", "blend_mode", "preserve_limbs", "seed",
              "expand_body", "full_body", "frame_scale", "control_scale",
              "outpaint_steps", "outpaint_control_scale",
              "refine_strength", "extend_ratio", "frame_align_x", "debug"):
        if k in cfg:
            payload[k] = cfg[k]
    if len(sys.argv) > 3:
        payload["seed"] = int(sys.argv[3])
    if len(sys.argv) > 4 and sys.argv[4] == "debug":
        payload["debug"] = True

    print(f"[submit] {name} mask={cfg['mask_target']}")
    t0 = time.time()
    try:
        res = post(f"{API}/sdapi/v1/job/submit", payload)
    except Exception as e:
        print("[submit error]", e)
        sys.exit(1)
    call_id = res.get("call_id")
    print(f"[job] {call_id}")

    while True:
        time.sleep(5)
        st = get(f"{API}/sdapi/v1/job/status/{call_id}")
        status = st.get("status")
        el = int(time.time() - t0)
        print(f"[poll {el:4d}s] {status}", flush=True)
        if status == "completed":
            imgs = st.get("images") or []
            img_b64 = imgs[0] if imgs else ""
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            out = f"{OUT_DIR}/test_{out_name}.png"
            try:
                dbg = json.loads(img_b64)
            except (ValueError, TypeError):
                dbg = None
            if isinstance(dbg, dict) and "image" in dbg:
                for key, val in dbg.items():
                    if not val:
                        continue
                    if "," in val:
                        val = val.split(",", 1)[1]
                    p = f"{OUT_DIR}/test_{out_name}_{key}.png"
                    with open(p, "wb") as f:
                        f.write(base64.b64decode(val))
                    print(f"[saved] {p}")
            else:
                with open(out, "wb") as f:
                    f.write(base64.b64decode(img_b64))
                print(f"[saved] {out}")
            break
        if status == "failed":
            print("[failed]", st.get("error"))
            break
        if el > 900:
            print("[timeout]")
            break

    b = billing()
    print(f"[billing] remaining=${b.get('remaining_usd')} used=${b.get('used_usd')}")


if __name__ == "__main__":
    main()
