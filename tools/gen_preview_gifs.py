#!/usr/bin/env python3
"""Genera GIFs de vista previa para los presets de video usando el backend
de Modal (job submit + polling) y los guarda en
assets/presets/video/<preset_id>/preview-5s.gif

Uso:
    python3 tools/gen_preview_gifs.py              # genera la lista PRESETS
    python3 tools/gen_preview_gifs.py vid-cowgirl  # solo ese preset

Requiere: pip install imageio-ffmpeg (ffmpeg estático, sin brew).
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

import imageio_ffmpeg

API = "https://leonardo-sh170--estudio-ia-serverless-api.us-east.modal.run"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_PATH = os.path.join(ROOT, "pruebas", "reference.JPG")
OUT_BASE = os.path.join(ROOT, "assets", "presets", "video")

WAN_NEGATIVE = (
    "lowres, blurry, overexposed, worst quality, low quality, deformed, "
    "distorted anatomy, morphing face, changing identity, extra limbs, "
    "extra fingers, repetitive motion, looping animation, identical "
    "repeated frames, frozen, motionless, sudden scene change, camera "
    "zoom, camera pan, moving background, watermark, text"
)

# (preset_id, lora_id, prompt) — prompts copiados de js/presets.js
PRESETS = [
    ("vid-breathing", "str1p",
     "str1p. The woman starts fully clothed, looks at the camera, slowly "
     "lifts her top and takes it off, revealing her bare breasts. She "
     "finishes topless with a natural smile and gentle movement. Sexy "
     "video, uncensored, static camera, no camera movement. str1p"),
    ("vid-camera", "tittydrop",
     "tittydrop. The woman starts with her top down, then pulls it up to "
     "reveal her bare breasts, lets them drop naturally with realistic "
     "bounce and physics, then smiles at the camera. Static camera, no "
     "zoom, realistic skin texture, uncensored. tittydrop"),
    ("vid-turn", "clothes_on_off",
     "clothes_on_off. The video starts with the woman fully clothed. She "
     "reaches toward the lens and covers the view with her hand. When she "
     "removes her hand she is completely naked in the same pose and "
     "background, showing bare breasts and vulva. Static camera, no zoom, "
     "realistic detail, HD. clothes_on_off"),
    ("vid-wind", "bounce",
     "bounce. A nude woman poses seductively, gently shifting her hips "
     "and bouncing naturally, breasts moving with realistic soft-body "
     "physics, alluring smile looking at viewer, static camera, locked "
     "tripod shot, realistic skin detail, uncensored. bounce"),
    ("vid-loop", "boob_grab",
     "boob_grab. A pretty woman smiles at the viewer, bare breasts moving "
     "naturally while her hands gently lift, squeeze and fondle them, "
     "seductive expression, static camera, no camera movement, realistic "
     "skin pores and lighting, uncensored. boob_grab"),
    ("vid-undress", "woman_undressing",
     "The woman slowly undresses herself piece by piece until she is "
     "fully nude, seductive natural motion, looking at the viewer. "
     "Static camera, no zoom."),
    ("vid-before-after", "before_after",
     "before and after transformation, person wears casual clothes. The "
     "woman starts fully clothed, then transforms to completely nude in "
     "the exact same pose and background, bare breasts and vulva visible. "
     "Static camera, no zoom."),
    ("vid-outfit-change", "outfit_change",
     "The woman is posing for the camera in her outfit, then a sudden "
     "outfit change into sexy black lace lingerie, she keeps posing and "
     "smiling naturally. Static camera, no zoom."),
    ("vid-cowgirl", "cowgirl",
     "The woman riding in cowgirl position on top, bouncing up and down "
     "rhythmically, her breasts moving with each motion, moaning "
     "expression. Static camera, no zoom."),
    ("vid-jelly-hips", "jelly_hips",
     "The woman standing and swaying her hips side to side with soft "
     "body jiggle physics, seductive slow dance, bare skin moving "
     "naturally. Static camera, no zoom."),
    ("vid-walk-back", "walking_back",
     "The woman turns around and walks away from the camera showing her "
     "back, natural walking motion, hips swaying. Static camera, no "
     "zoom."),
    ("vid-kiss-you", "kiss_you",
     "The woman leans toward the camera and kisses the lens, blowing a "
     "kiss, lips close-up. Static camera, no zoom."),
]


def http_json(url, payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Bypass-Tunnel-Reminder": "true",
        },
        method="POST" if data else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())


def submit_job(b64img, lora_id, prompt):
    return http_json(
        f"{API}/sdapi/v1/job/submit",
        {
            "prompt": prompt,
            "negative_prompt": WAN_NEGATIVE,
            "steps": 6,
            "cfg_scale": 1.0,
            "lora_scale": 0.85,
            "lora_id": lora_id,
            "mask_target": "all_clothes",
            "skin_pre_adapt": True,
            "width": 480,
            "height": 832,
            "is_video": True,
            "video_duration_seconds": 5,
            "init_images": [b64img],
            "denoising_strength": 1.0,
        },
        timeout=30,
    )


def poll_job(call_id, media_type="video", max_wait=540):
    url = f"{API}/sdapi/v1/job/status/{call_id}?media_type={media_type}"
    start = time.time()
    while time.time() - start < max_wait:
        time.sleep(3)
        try:
            data = http_json(url, timeout=20)
        except Exception:
            continue
        status = data.get("status")
        if status == "completed":
            return data
        if status == "failed":
            raise RuntimeError(data.get("error") or "job failed")
    raise TimeoutError("job timeout")


def mp4_to_gif(mp4_path, gif_path, fps=10, width=320):
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    filters = (
        f"fps={fps},scale={width}:-2:flags=lanczos,"
        "split[s0][s1];[s0]palettegen=max_colors=128[p];"
        "[s1][p]paletteuse=dither=bayer"
    )
    subprocess.run(
        [ffmpeg, "-y", "-i", mp4_path, "-vf", filters, gif_path],
        check=True,
        capture_output=True,
    )


def main():
    only = set(sys.argv[1:])
    with open(IMG_PATH, "rb") as f:
        b64img = base64.b64encode(f.read()).decode()

    for preset_id, lora_id, prompt in PRESETS:
        if only and preset_id not in only:
            continue
        out_dir = os.path.join(OUT_BASE, preset_id)
        gif_path = os.path.join(out_dir, "preview-5s.gif")
        if os.path.exists(gif_path):
            print(f"[skip] {preset_id} ya tiene GIF")
            continue

        print(f"[gen ] {preset_id} (lora={lora_id}) ...", flush=True)
        try:
            submit = submit_job(b64img, lora_id, prompt)
            call_id = submit["call_id"]
            data = poll_job(call_id, submit.get("media_type", "video"))
            video_b64 = data["video"]
        except Exception as e:
            print(f"[fail] {preset_id}: {e}")
            continue

        os.makedirs(out_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            suffix=".mp4", delete=False
        ) as tmp:
            tmp.write(base64.b64decode(video_b64))
            tmp_path = tmp.name
        try:
            mp4_to_gif(tmp_path, gif_path)
            size_kb = os.path.getsize(gif_path) // 1024
            print(f"[ ok ] {gif_path} ({size_kb} KB)")
        finally:
            os.unlink(tmp_path)


if __name__ == "__main__":
    main()
