"""
Servidor Serverless de Estudio IA en Modal.com
----------------------------------------------
Imagen:
- Checkpoint completo LUSTIFY SDXL Inpainting (9 canales), sin mezclar
  text-encoders/VAE/UNet de repositorios distintos.
- Máscara automática estilo VTON: SegFormer ATR para ropa/cuerpo + YOLOv8 Pose
  para torso, manos y ControlNet OpenPose.
- Protección explícita de cara, cabello, accesorios, brazos, manos y piernas.
- `padding_mask_crop`, `strength=1.0`, composición por máscara suavizada.

Video:
- Wan 2.1 I2V Lightning a 81 fotogramas por segmento.
- Videos de 5s/10s/20s generados como 1/2/4 segmentos consecutivos, usando el
  último fotograma real como imagen inicial del siguiente segmento.
"""

import base64
import io
import os
import tempfile
import modal

# =====================================================================
# 1. REPOSITORIOS PÚBLICOS VERIFICADOS (HUGGINGFACE / CIVITAI)
# =====================================================================

SDXL_BASE_REPO = "TheImposterImposters/LUSTIFY-v2.0"
SDXL_BASE_DIR = "/root/models/lustify_sdxl"

SDXL_INPAINT_REPO = "andro-flock/LUSTIFY-SDXL-NSFW-checkpoint-v2-0-INPAINTING"
SDXL_INPAINT_DIR = "/root/models/lustify_inpaint_full"

SDXL_OPENPOSE_CONTROLNET_REPO = "xinsir/controlnet-openpose-sdxl-1.0"
SDXL_OPENPOSE_CONTROLNET_DIR = "/root/models/openpose_sdxl_controlnet"

SDXL_LORA_URL = (
    "https://huggingface.co/LyliaEngine/add-detail-xl/"
    "resolve/main/add-detail-xl.safetensors"
)
SDXL_LORA_PATH = "/root/models/add-detail-xl.safetensors"

REAL_ESRGAN_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/"
    "v0.1.0/RealESRGAN_x4plus.pth"
)
REAL_ESRGAN_PATH = "/root/models/RealESRGAN_x4plus.pth"

CLOTH_SEG_REPO = "mattmdjaga/segformer_b2_clothes"
CLOTH_SEG_DIR = "/root/models/segformer_clothes"

WAN_LIGHTNING_BF16_REPO = "magespace/Wan2.1-I2V-14B-480P-Lightning-Diffusers"

CIVITAI_WAN_LORAS = {
    # --- Originales (Chroma111 / wangkanai mirrors) ---
    "str1p": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/str1p_v1.safetensors"
    ),
    "tittydrop": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/I2V-tittydrop-e26.safetensors"
    ),
    "clothes_on_off": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/Wan_ClothesOnOff_Trend.safetensors"
    ),
    "bounce": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-bounce-v1.safetensors"
    ),
    "boob_grab": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/boob_grab_epoch045.safetensors"
    ),
    # --- Chroma111/CivitAI-Archive (nuevos) ---
    "outfit_change": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/SuddenOutfitChange_V03.safetensors"
    ),
    "rip_shura": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/rip-shura-000006.safetensors"
    ),
    "pulldown_shura": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/pulldown-shura-final-000006.safetensors"
    ),
    "before_after": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/wan_i2v-480p-beforeafter_v1.safetensors"
    ),
    "woman_undressing": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/woman_undressing_v1.0_wan14b_epoch048.safetensors"
    ),
    "tittydrop_t2v": (
        "https://huggingface.co/Chroma111/CivitAI-Archive/resolve/main/"
        "wan_video/wan_tittydrop_v1_t2v_14b.safetensors"
    ),
    # --- wangkanai/wan21-fp8-loras-nsfw ---
    "missionary_pov": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-missionary-pov-i2v-v2.safetensors"
    ),
    "doggypov": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-doggypov-v2.safetensors"
    ),
    "front_doggy": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-front-doggy-plow-v2.safetensors"
    ),
    "orgasm_i2v": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-orgasm-i2v-720p.safetensors"
    ),
    "doggystyle_front_t2v": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-doggystylefromfront-t2v.safetensors"
    ),
    "missionary_pov_t2v": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-missionary-pov-v2.safetensors"
    ),
    "orgasm_t2v": (
        "https://huggingface.co/wangkanai/wan21-fp8-loras-nsfw/resolve/main/"
        "loras/wan/wan21-action-orgasm-v2-t2v-14b.safetensors"
    ),
    # --- kimjob/wan_i2v_NSFW_lora (colección Wan 2.1 I2V) ---
    "cowgirl": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/c0wg1rl_WAN-i2v-480p-80.safetensors"
    ),
    "pov_missionary_i2v": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan_pov_missionary_i2v_v1.1.safetensors"
    ),
    "squirt_i2v": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan-i2v-squirt-k3nk-234epo.safetensors"
    ),
    "jelly_hips": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan-jelly-hips-i2v-16epo-k3nk.safetensors"
    ),
    "fingering": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/fingering_i2v_e248.safetensors"
    ),
    "holdup": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/i2v_480p_zxtp_holdup_v1.safetensors"
    ),
    "anal_insertion": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan2.1-i2v-480p-anal-insertion-v1.0.safetensors"
    ),
    "pov_insertion": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan2.1-i2v-480p-pov-insertion-v1.0.safetensors"
    ),
    "flaccid": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan2.1-i2v-480p-flaccid-v1.0.safetensors"
    ),
    "cumshot": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan_cumshot_i2v.safetensors"
    ),
    "female_masturbation": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan_female_masturbation.safetensors"
    ),
    "kissing": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/WAN_Passionate_Kissing_v1.safetensors"
    ),
    "spanking": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/spanking_for_wan_v1_e128.safetensors"
    ),
    "standing_doggy": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/standingdoggy-shura-000005.safetensors"
    ),
    "sex_machine": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/sexmachine-shura-000003.safetensors"
    ),
    "squirt_shura": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/squirt-shura-final-000003.safetensors"
    ),
    "lactate_shura": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/lactate-shura-000002.safetensors"
    ),
    "fmas_shura": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/fmas-shura-final-000003.safetensors"
    ),
    "titfuck": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/BetterTitfuck_v4_July2025.safetensors"
    ),
    "hand_panties": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/I2V%20-%20Hand%20in%20Panties%20v4%20-%20720p.safetensors"
    ),
    "pov_handjob": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/I2V%20-%20POV%20Handjob.safetensors"
    ),
    "deepthroat": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/jfj-deepthroat-v1.safetensors"
    ),
    "ult_deepthroat": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan-ultimatedeepthroat-182epo-k3nk.safetensors"
    ),
    "fullnelson": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/wan-fullnelson-v3-60epo-k3nk.safetensors"
    ),
    "ahegao": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/ahegao_v1_e35_wan.safetensors"
    ),
    "nipple_suck": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/nippleSuckWan_e40.safetensors"
    ),
    "cunnilingus": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/cunn_wan_epoch_80.safetensors"
    ),
    "dildo_ride": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/dildo_ride-14b-v2.safetensors"
    ),
    "masturbation_cumshot": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/masturbation_cumshot_v1.1_e310.safetensors"
    ),
    "two_fingers": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/WanTwoFingers.safetensors"
    ),
    "erect_penis": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/erect_penis_epoch_80.safetensors"
    ),
    "genitals_helper": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/genitals_helper_v1.0_e219.safetensors"
    ),
    "walking_back": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/P002-The-Walking-Back-i2v-v20-000010_converted.safetensors"
    ),
    "dogeza": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/Dogeza.safetensors"
    ),
    "forward_bends": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/BouncingForwardBendsV01.safetensors"
    ),
    "slap": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/slap-v3.safetensors"
    ),
    "hand_panties_v3": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/T2V-I2V_h4nd_p4nties_v3.safetensors"
    ),
    "kiss_you": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/kiss%20you_V2_wan_comfy.safetensors"
    ),
    "dr34mj0b": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/WAN_dr34mj0b.safetensors"
    ),
    "innie_pussy_t2v": (
        "https://huggingface.co/kimjob/wan_i2v_NSFW_lora/resolve/main/"
        "loras/T2V%20-%20Innie%20Pussy%20v2%20-%2014B.safetensors"
    ),
}

VOLUME_PATH = "/models"
vol = modal.Volume.from_name("estudio-ia-models-vol", create_if_missing=True)

MODAL_CREDIT_BUDGET_USD = float(
    os.environ.get("MODAL_CREDIT_BUDGET_USD", "30.00")
)
MIN_GENERATION_CREDIT_USD = float(
    os.environ.get("MODAL_MIN_GENERATION_CREDIT_USD", "1.00")
)


def download_base_sdxl():
    """Paso 1 de caché."""
    import urllib.request
    from huggingface_hub import snapshot_download

    os.makedirs(SDXL_BASE_DIR, exist_ok=True)
    snapshot_download(
        repo_id=SDXL_BASE_REPO,
        local_dir=SDXL_BASE_DIR,
        allow_patterns=[
            "*.json",
            "*.txt",
            "*/*.json",
            "*/*.txt",
            "*/*.fp16.safetensors",
        ],
    )
    urllib.request.urlretrieve(SDXL_LORA_URL, SDXL_LORA_PATH)


def download_inpaint_and_segmenter():
    """Descarga el checkpoint completo de inpainting, pose y segmentación."""
    import urllib.request

    from huggingface_hub import snapshot_download
    from ultralytics import YOLO

    inpaint_patterns = [
        "model_index.json",
        "scheduler/*.json",
        "text_encoder/*.json",
        "text_encoder/*.safetensors",
        "text_encoder_2/*.json",
        "text_encoder_2/*.safetensors",
        "tokenizer/*",
        "tokenizer_2/*",
        "unet/*.json",
        "unet/*.safetensors",
        "vae/*.json",
        "vae/*.safetensors",
    ]

    os.makedirs(SDXL_INPAINT_DIR, exist_ok=True)
    snapshot_download(
        repo_id=SDXL_INPAINT_REPO,
        local_dir=SDXL_INPAINT_DIR,
        allow_patterns=inpaint_patterns,
    )

    os.makedirs(SDXL_OPENPOSE_CONTROLNET_DIR, exist_ok=True)
    snapshot_download(
        repo_id=SDXL_OPENPOSE_CONTROLNET_REPO,
        local_dir=SDXL_OPENPOSE_CONTROLNET_DIR,
        allow_patterns=["config.json", "diffusion_pytorch_model.safetensors"],
    )

    os.makedirs(CLOTH_SEG_DIR, exist_ok=True)
    snapshot_download(
        repo_id=CLOTH_SEG_REPO,
        local_dir=CLOTH_SEG_DIR,
        allow_patterns=["*.json", "model.safetensors"],
    )

    if not os.path.exists(REAL_ESRGAN_PATH):
        urllib.request.urlretrieve(REAL_ESRGAN_URL, REAL_ESRGAN_PATH)

    YOLO("/root/models/yolov8n-pose.pt")


engine_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.6.0",
        "torchvision==0.21.0",
        "diffusers==0.34.0",
        "transformers==4.49.0",
        "accelerate==1.4.0",
        "peft>=0.15.0",
        "safetensors==0.5.2",
        "fastapi[standard]==0.115.8",
        "pillow==11.1.0",
        "imageio==2.37.0",
        "imageio-ffmpeg==0.6.0",
        "ftfy==6.3.1",
        "omegaconf==2.3.0",
        "huggingface_hub[hf_xet]>=0.29.0",
        "opencv-python-headless==4.11.0.86",
        "ultralytics==8.3.75",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
    .run_function(download_base_sdxl)
    .run_function(download_inpaint_and_segmenter)
)

app = modal.App("estudio-ia-serverless", image=engine_image)


def get_sdxl_native_dimensions(w: int, h: int) -> tuple[int, int]:
    """Calcula la resolución nativa SDXL (~1 MP) según la proporción."""
    aspect = w / h if h > 0 else 1.0
    if aspect < 0.78:
        return 832, 1216
    elif aspect < 0.92:
        return 896, 1152
    elif aspect <= 1.08:
        return 1024, 1024
    elif aspect <= 1.28:
        return 1152, 896
    else:
        return 1216, 832


# =====================================================================
# MOTOR 1: INPAINTING 9-CANALES CON PROTECCIÓN DE BRAZOS, PIERNAS Y FONDO
# =====================================================================
@app.cls(
    gpu="A100-80GB",
    scaledown_window=60,
    timeout=300,
)
class ImageEngine:
    @modal.enter()
    def setup(self):
        import torch
        from diffusers import (
            ControlNetModel,
            DPMSolverMultistepScheduler,
            StableDiffusionXLControlNetInpaintPipeline,
            StableDiffusionXLPipeline,
        )
        from transformers import (
            AutoImageProcessor,
            AutoModelForSemanticSegmentation,
        )
        from ultralytics import YOLO

        self.cloth_processor = AutoImageProcessor.from_pretrained(
            CLOTH_SEG_DIR, local_files_only=True
        )
        self.cloth_model = (
            AutoModelForSemanticSegmentation.from_pretrained(
                CLOTH_SEG_DIR, local_files_only=True
            )
            .to("cuda")
            .eval()
        )
        self.pose_model = YOLO("/root/models/yolov8n-pose.pt")
        self._txt2img = None
        self._real_esrgan = None
        self._txt2img_cls = StableDiffusionXLPipeline
        self._torch = torch

        self.inpaint_scheduler = DPMSolverMultistepScheduler(
            beta_start=0.00085,
            beta_end=0.012,
            beta_schedule="scaled_linear",
            num_train_timesteps=1000,
            use_karras_sigmas=True,
            algorithm_type="sde-dpmsolver++",
            steps_offset=1,
        )

        controlnet = ControlNetModel.from_pretrained(
            SDXL_OPENPOSE_CONTROLNET_DIR,
            torch_dtype=torch.float16,
            use_safetensors=True,
            local_files_only=True,
        )
        self.controlnet = controlnet
        self.inpaint = StableDiffusionXLControlNetInpaintPipeline.from_pretrained(
            SDXL_INPAINT_DIR,
            controlnet=controlnet,
            scheduler=self.inpaint_scheduler,
            torch_dtype=torch.float16,
            use_safetensors=True,
            local_files_only=True,
        ).to("cuda")
        self.inpaint.watermark = None
        self.inpaint.safety_checker = None
        self.detail_adapter_loaded = False

        if os.path.exists(SDXL_LORA_PATH):
            try:
                self.inpaint.load_lora_weights(
                    SDXL_LORA_PATH, adapter_name="detail_xl"
                )
                self.inpaint.set_adapters(
                    ["detail_xl"], adapter_weights=[0.65]
                )
                self.detail_adapter_loaded = True
            except Exception as e:
                print(f"LoRA warn: {e}")

        print(
            "ImageEngine ready:",
            self.inpaint.__class__.__name__,
            "unet_in=",
            self.inpaint.unet.config.in_channels,
            "controlnet=",
            self.inpaint.controlnet.__class__.__name__,
            "scheduler=",
            self.inpaint.scheduler.__class__.__name__,
        )

    def _get_txt2img(self):
        """Carga txt2img solo cuando el usuario no sube imagen de entrada."""
        if self._txt2img is None:
            self._txt2img = self._txt2img_cls.from_pretrained(
                SDXL_BASE_DIR,
                torch_dtype=self._torch.float16,
                variant="fp16",
                use_safetensors=True,
                local_files_only=True,
            ).to("cuda")
            scheduler_cls = self.inpaint.scheduler.__class__
            self._txt2img.scheduler = scheduler_cls.from_config(
                self.inpaint.scheduler.config
            )
            self._txt2img.watermark = None
            self._txt2img.safety_checker = None
        return self._txt2img

    def _get_real_esrgan(self):
        """Carga Real-ESRGAN sin depender de basicsr/realesrgan."""
        if self._real_esrgan is None:
            import torch
            import torch.nn as nn
            import torch.nn.functional as F

            class ResidualDenseBlock(nn.Module):
                def __init__(self, num_feat=64, num_grow_ch=32):
                    super().__init__()
                    self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
                    self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
                    self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
                    self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
                    self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
                    self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

                def forward(self, x):
                    x1 = self.lrelu(self.conv1(x))
                    x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
                    x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
                    x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
                    x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
                    return x5 * 0.2 + x

            class RRDB(nn.Module):
                def __init__(self, num_feat, num_grow_ch=32):
                    super().__init__()
                    self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
                    self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
                    self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

                def forward(self, x):
                    return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x

            class RRDBNet(nn.Module):
                def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32):
                    super().__init__()
                    self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
                    self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
                    self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
                    self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
                    self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
                    self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
                    self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
                    self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

                def forward(self, x):
                    feat = self.conv_first(x)
                    body_feat = self.conv_body(self.body(feat))
                    feat = feat + body_feat
                    feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
                    feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
                    return self.conv_last(self.lrelu(self.conv_hr(feat)))

            state = torch.load(REAL_ESRGAN_PATH, map_location="cpu")
            state = state.get("params_ema") or state.get("params") or state
            model = RRDBNet().to("cuda", dtype=torch.float16)
            model.load_state_dict(state, strict=True)
            self._real_esrgan = model.eval()
        return self._real_esrgan

    def _enhance_photo(
        self, image, detail_restore=0.45, color_restore=0.60
    ):
        """Restauración no destructiva: denoise, SR 4x y salida final 2x."""
        import cv2
        import numpy as np
        from PIL import Image, ImageEnhance, ImageFilter

        src_rgb = np.array(image)
        src = cv2.cvtColor(src_rgb, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32)
        residual = gray - cv2.GaussianBlur(
            gray, (0, 0), sigmaX=1.0, sigmaY=1.0
        )
        noise_score = float(
            np.median(np.abs(residual)) * 1.4826
        )
        denoise_h = (
            3
            if noise_score > 6.0
            else 2
            if noise_score > 3.5
            else 1
            if noise_score > 1.5
            else 0
        )
        print(
            "Enhance analysis:",
            f"noise_sigma={noise_score:.2f} denoise_h={denoise_h}",
        )
        if denoise_h > 0:
            src = cv2.fastNlMeansDenoisingColored(
                src, None, denoise_h, denoise_h, 7, 21
            )
            src_rgb = cv2.cvtColor(src, cv2.COLOR_BGR2RGB)
        tensor = self._torch.from_numpy(src_rgb).permute(2, 0, 1).unsqueeze(0)
        tensor = tensor.to("cuda", dtype=self._torch.float16) / 255.0
        with self._torch.inference_mode():
            output = self._get_real_esrgan()(tensor)
        out = output.float().clamp(0, 1).squeeze(0).permute(1, 2, 0)
        out_np = (out.cpu().numpy() * 255.0).round().astype(np.uint8)
        upscaled = Image.fromarray(out_np).resize(
            (image.width * 2, image.height * 2), Image.LANCZOS
        )

        arr = np.array(upscaled).astype(np.float32)
        if detail_restore > 0:
            reference = image.resize(
                (image.width * 2, image.height * 2), Image.LANCZOS
            )
            ref = np.array(reference).astype(np.float32)
            ref_u8 = np.clip(ref, 0, 255).astype(np.uint8)
            skin_ycrcb = cv2.cvtColor(
                ref_u8, cv2.COLOR_RGB2YCrCb
            )
            _, skin_cr, skin_cb = cv2.split(skin_ycrcb)
            skin_mask = (
                (skin_cr >= 112)
                & (skin_cr <= 190)
                & (skin_cb >= 70)
                & (skin_cb <= 150)
            ).astype(np.uint8) * 255
            skin_mask = cv2.morphologyEx(
                skin_mask,
                cv2.MORPH_CLOSE,
                np.ones((5, 5), np.uint8),
            )
            skin_mask = cv2.GaussianBlur(
                skin_mask, (0, 0), sigmaX=3.0, sigmaY=3.0
            ).astype(np.float32) / 255.0

            out_yuv = cv2.cvtColor(arr, cv2.COLOR_RGB2YUV)
            ref_yuv = cv2.cvtColor(ref, cv2.COLOR_RGB2YUV)
            ref_y = ref_yuv[:, :, 0]
            out_y = out_yuv[:, :, 0]
            luma_mix = {
                3: 0.72,
                2: 0.55,
                1: 0.34,
                0: 0.18,
            }.get(denoise_h, 0.18)
            luma_mix *= min(1.0, detail_restore / 0.40)
            skin_luma_mix = luma_mix * 0.40
            luma_weights = luma_mix * (1.0 - skin_mask) + skin_luma_mix * skin_mask
            base_y = out_y * luma_weights + ref_y * (1.0 - luma_weights)

            ref_texture = ref_y - cv2.GaussianBlur(
                ref_y, (0, 0), sigmaX=1.1, sigmaY=1.1
            )
            out_texture = out_y - cv2.GaussianBlur(
                out_y, (0, 0), sigmaX=1.1, sigmaY=1.1
            )
            texture_weights = 0.15 + (0.85 * skin_mask)
            ref_texture_weight, out_texture_weight = {
                0: (0.90, 0.35),
                1: (0.60, 0.40),
                2: (0.35, 0.45),
                3: (0.18, 0.50),
            }.get(denoise_h, (0.90, 0.35))
            base_y = np.clip(
                base_y
                + detail_restore
                * (
                    ref_texture_weight * ref_texture
                    + out_texture_weight * out_texture
                )
                * texture_weights,
                0,
                255,
            )
            for channel in (1, 2):
                out_yuv[:, :, channel] = (
                    out_yuv[:, :, channel] * (1.0 - color_restore)
                    + ref_yuv[:, :, channel] * color_restore
                )
            clahe_y = cv2.createCLAHE(
                clipLimit=1.35, tileGridSize=(8, 8)
            ).apply(np.clip(base_y, 0, 255).astype(np.uint8))
            contrast_weights = np.clip(
                detail_restore * (0.10 + 0.30 * skin_mask),
                0.0,
                0.24,
            )
            out_yuv[:, :, 0] = np.clip(
                base_y * (1.0 - contrast_weights)
                + clahe_y * contrast_weights,
                0,
                255,
            )
            arr = cv2.cvtColor(out_yuv, cv2.COLOR_YUV2RGB)

        upscaled = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        return upscaled.filter(
            ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=3)
        )

    @staticmethod
    def _draw_pose_condition(size, people_kpts, people_conf=None):
        import numpy as np
        from PIL import Image, ImageDraw

        w, h = size
        pose_img = Image.new("RGB", (w, h), (0, 0, 0))
        draw = ImageDraw.Draw(pose_img)
        if people_kpts is None or len(people_kpts) == 0:
            return pose_img, False

        line_w = max(5, int(min(w, h) * 0.008))
        joint_r = line_w + 1
        bones = [
            (17, 5, (255, 0, 0)), (17, 6, (0, 255, 0)),
            (5, 7, (255, 80, 0)), (7, 9, (255, 160, 0)),
            (6, 8, (0, 255, 80)), (8, 10, (0, 255, 160)),
            (17, 18, (180, 0, 255)), (5, 11, (255, 0, 120)),
            (6, 12, (0, 120, 255)), (11, 13, (255, 0, 220)),
            (13, 15, (255, 80, 255)), (12, 14, (80, 80, 255)),
            (14, 16, (80, 220, 255)), (17, 0, (255, 255, 0)),
            (0, 1, (255, 255, 80)), (1, 3, (255, 200, 80)),
            (0, 2, (80, 255, 255)), (2, 4, (80, 200, 255)),
        ]
        pose_ok = False

        for person_idx, kpts in enumerate(people_kpts):
            if kpts is None or len(kpts) < 17:
                continue
            conf = None
            if people_conf is not None and person_idx < len(people_conf):
                conf = people_conf[person_idx]

            pts = np.zeros((19, 2), dtype=np.float32)
            valid = np.zeros(19, dtype=bool)
            for i in range(17):
                x, y = float(kpts[i][0]), float(kpts[i][1])
                ok = x > 1 and y > 1
                if conf is not None and i < len(conf):
                    ok = ok and float(conf[i]) >= 0.25
                if ok:
                    pts[i] = (x, y)
                    valid[i] = True

            if valid[5] and valid[6]:
                pts[17] = (pts[5] + pts[6]) * 0.5
                valid[17] = True
            if valid[11] and valid[12]:
                pts[18] = (pts[11] + pts[12]) * 0.5
                valid[18] = True

            for a, b, color in bones:
                if valid[a] and valid[b]:
                    draw.line(
                        [tuple(pts[a]), tuple(pts[b])],
                        fill=color,
                        width=line_w,
                    )
            for i in range(19):
                if valid[i]:
                    x, y = float(pts[i][0]), float(pts[i][1])
                    draw.ellipse(
                        [x - joint_r, y - joint_r, x + joint_r, y + joint_r],
                        fill=(255, 255, 255),
                    )
            pose_ok = pose_ok or bool(
                valid[5] and valid[6] and valid.sum() >= 8
            )

        return pose_img, pose_ok

    def _analyze_anatomy_and_mask(
        self,
        pil_img,
        mask_target="all_clothes",
        preserve_limbs=True,
        expand_body=False,
    ):
        import numpy as np
        import torch
        import torch.nn.functional as F
        from PIL import Image, ImageDraw, ImageFilter

        w, h = pil_img.size
        img_np = np.array(pil_img)

        inputs = self.cloth_processor(images=pil_img, return_tensors="pt").to(
            "cuda"
        )
        with torch.no_grad():
            outputs = self.cloth_model(**inputs)
            logits = F.interpolate(
                outputs.logits,
                size=(h, w),
                mode="bilinear",
                align_corners=False,
            )
            seg_map = logits.argmax(dim=1)[0].cpu().numpy()

        sh_top = int(h * 0.28)
        torso_h = int(h * 0.36)
        cx_torso = w // 2
        half_torso_w = int(w * 0.18)
        people_kpts = []
        people_conf = []
        wrist_pts = []
        torso_poly_img = Image.new("L", (w, h), 0)
        torso_draw = ImageDraw.Draw(torso_poly_img)
        upper_zone_img = Image.new("L", (w, h), 0)
        upper_zone_draw = ImageDraw.Draw(upper_zone_img)
        torso_drawn = False

        def draw_torso_area(draw, cx, shoulder_top, height, half_width):
            top_y = int(shoulder_top - height * 0.03)
            chest_y = int(shoulder_top + height * 0.20)
            waist_y = int(shoulder_top + height * 0.60)
            bottom_y = int(
                shoulder_top
                + height * (0.58 if mask_target == "upper_clothes" else 1.04)
            )
            draw.polygon(
                [
                    (max(0, cx - int(half_width * 0.88)), max(0, top_y)),
                    (min(w, cx + int(half_width * 0.88)), max(0, top_y)),
                    (min(w, cx + half_width), min(h, chest_y)),
                    (min(w, cx + int(half_width * 0.68)), min(h, waist_y)),
                    (min(w, cx + int(half_width * 0.76)), min(h, bottom_y)),
                    (max(0, cx - int(half_width * 0.76)), min(h, bottom_y)),
                    (max(0, cx - int(half_width * 0.68)), min(h, waist_y)),
                    (max(0, cx - half_width), min(h, chest_y)),
                ],
                fill=255,
            )

        seg_head_np = np.isin(seg_map, [1, 2, 3, 11]).astype(np.uint8) * 255
        head_area = Image.new("L", (w, h), 0)
        head_area_draw = ImageDraw.Draw(head_area)
        head_area_from_pose = False
        person_box_area = Image.new("L", (w, h), 0)
        person_box_draw = ImageDraw.Draw(person_box_area)
        person_box_from_pose = False
        person_box_bounds = []
        limb_pose_area = Image.new("L", (w, h), 0)
        limb_pose_draw = ImageDraw.Draw(limb_pose_area)
        body_hull_np = np.zeros((h, w), dtype=np.uint8)

        try:
            pose_res = self.pose_model.predict(img_np, verbose=False)
            if (
                pose_res
                and pose_res[0].keypoints is not None
                and len(pose_res[0].keypoints.xy) > 0
            ):
                people_kpts = pose_res[0].keypoints.xy.cpu().numpy()
                raw_conf = getattr(pose_res[0].keypoints, "conf", None)
                if raw_conf is not None and len(raw_conf) > 0:
                    people_conf = raw_conf.cpu().numpy()

                raw_boxes = getattr(pose_res[0], "boxes", None)
                if raw_boxes is not None and raw_boxes.xyxy is not None:
                    boxes = raw_boxes.xyxy.cpu().numpy()
                    for box in boxes:
                        x1, y1, x2, y2 = [float(v) for v in box[:4]]
                        person_box_bounds.append(
                            [int(x1), int(y1), int(x2), int(y2)]
                        )
                        pad_x = max(8, int((x2 - x1) * 0.10))
                        pad_y = max(8, int((y2 - y1) * 0.06))
                        person_box_draw.rectangle(
                            [
                                max(0, int(x1 - pad_x)),
                                max(0, int(y1 - pad_y)),
                                min(w, int(x2 + pad_x)),
                                min(h, int(y2 + pad_y)),
                            ],
                            fill=255,
                        )
                        person_box_from_pose = True

                for person_idx, kpts in enumerate(people_kpts):
                    if kpts is None or len(kpts) < 17:
                        continue
                    conf = None
                    if people_conf is not None and person_idx < len(people_conf):
                        conf = people_conf[person_idx]

                    def kp_ok(idx):
                        if kpts[idx][0] <= 1 or kpts[idx][1] <= 1:
                            return False
                        return conf is None or float(conf[idx]) >= 0.25

                    if expand_body and kp_ok(5) and kp_ok(6):
                        lower_ys = [
                            float(kpts[i][1])
                            for i in range(11, 17)
                            if kp_ok(i)
                        ]
                        needs_expand = (
                            len(lower_ys) < 4
                            or float(np.median(lower_ys)) > h * 0.88
                        )
                        if needs_expand:
                            ls, rs = kpts[5], kpts[6]
                            sh_dist = max(
                                40.0, abs(float(ls[0]) - float(rs[0]))
                            )
                            p_sh_top = min(float(ls[1]), float(rs[1]))
                            cx = (float(ls[0]) + float(rs[0])) * 0.5
                            hip_y = min(
                                h - 24,
                                max(
                                    int(h * 0.66),
                                    int(p_sh_top + sh_dist * 1.10),
                                ),
                            )
                            hip_dx = max(36, int(sh_dist * 0.24))
                            knee_y = min(
                                h - 8,
                                hip_y + max(100, int(sh_dist * 0.45)),
                            )
                            knee_dx = max(48, int(sh_dist * 0.38))
                            inferred = {
                                11: (cx - hip_dx, hip_y),
                                12: (cx + hip_dx, hip_y),
                                13: (cx - knee_dx, knee_y),
                                14: (cx + knee_dx, knee_y),
                                15: (
                                    cx - knee_dx * 0.78,
                                    min(h - 4, knee_y + sh_dist * 0.18),
                                ),
                                16: (
                                    cx + knee_dx * 0.78,
                                    min(h - 4, knee_y + sh_dist * 0.18),
                                ),
                            }
                            for idx, (x, y) in inferred.items():
                                kpts[idx] = (x, y)
                                if conf is not None and idx < len(conf):
                                    conf[idx] = 0.80

                    body_pts = [
                        kpts[i] for i in range(5, 17) if kp_ok(i)
                    ]
                    if len(body_pts) >= 3:
                        import cv2

                        hull_pts = np.array(
                            body_pts, dtype=np.int32
                        ).reshape(-1, 1, 2)
                        hull = cv2.convexHull(hull_pts)
                        cv2.fillConvexPoly(body_hull_np, hull, 255)

                    head_pts = [kpts[i] for i in range(5) if kp_ok(i)]
                    sh_pts = [kpts[i] for i in (5, 6) if kp_ok(i)]
                    hip_pts = [kpts[i] for i in (11, 12) if kp_ok(i)]
                    wrist_pts.extend(
                        [kpts[i] for i in (9, 10) if kp_ok(i)]
                    )

                    if len(sh_pts) != 2:
                        continue

                    ls, rs = sh_pts[0], sh_pts[1]
                    p_sh_top = int(min(float(ls[1]), float(rs[1])))
                    sh_dist = max(40.0, abs(float(ls[0]) - float(rs[0])))
                    p_cx = int((float(ls[0]) + float(rs[0])) * 0.5)
                    p_half = int(sh_dist * 0.52)
                    arm_w = max(56, int(sh_dist * 0.42))
                    leg_w = max(68, int(sh_dist * 0.48))
                    for a, b in [(5, 7), (7, 9), (6, 8), (8, 10)]:
                        if kp_ok(a) and kp_ok(b):
                            limb_pose_draw.line(
                                [
                                    (float(kpts[a][0]), float(kpts[a][1])),
                                    (float(kpts[b][0]), float(kpts[b][1])),
                                ],
                                fill=255,
                                width=arm_w,
                            )
                    for a, b in [
                        (11, 13),
                        (13, 15),
                        (12, 14),
                        (14, 16),
                    ]:
                        if kp_ok(a) and kp_ok(b):
                            limb_pose_draw.line(
                                [
                                    (float(kpts[a][0]), float(kpts[a][1])),
                                    (float(kpts[b][0]), float(kpts[b][1])),
                                ],
                                fill=255,
                                width=leg_w,
                            )
                    if len(hip_pts) == 2:
                        lh, rh = hip_pts[0], hip_pts[1]
                        hip_y = int(max(float(lh[1]), float(rh[1])))
                        p_torso_h = max(80, hip_y - p_sh_top)
                    else:
                        p_torso_h = int(sh_dist * 1.38)

                    if not torso_drawn:
                        sh_top = p_sh_top
                        torso_h = p_torso_h
                        cx_torso = p_cx
                        half_torso_w = p_half

                    draw_torso_area(
                        torso_draw,
                        p_cx,
                        p_sh_top,
                        p_torso_h,
                        p_half,
                    )
                    upper_zone_draw.rectangle(
                        [
                            max(0, p_cx - int(p_half * 1.35)),
                            max(0, int(p_sh_top - p_torso_h * 0.05)),
                            min(w, p_cx + int(p_half * 1.35)),
                            min(h, int(p_sh_top + p_torso_h * 0.62)),
                        ],
                        fill=255,
                    )
                    torso_drawn = True

                    if head_pts:
                        xs = [float(p[0]) for p in head_pts]
                        ys = [float(p[1]) for p in head_pts]
                        hcx = int(sum(xs) / len(xs))
                        hcy = int(sum(ys) / len(ys))
                        rad = max(
                            int((p_sh_top - hcy) * 0.90), int(sh_dist * 0.36)
                        )
                    else:
                        hcx = p_cx
                        hcy = int(p_sh_top - sh_dist * 0.42)
                        rad = int(sh_dist * 0.48)

                    head_area_draw.ellipse(
                        [
                            hcx - int(rad * 1.18),
                            hcy - int(rad * 1.45),
                            hcx + int(rad * 1.18),
                            hcy + int(rad * 0.55),
                        ],
                        fill=255,
                    )
                    head_area_from_pose = True
        except Exception as e:
            print(f"Pose warn: {e}")

        pose_img, pose_ok = self._draw_pose_condition(
            (w, h), people_kpts, people_conf
        )

        if not torso_drawn:
            draw_torso_area(
                torso_draw,
                cx_torso,
                sh_top,
                torso_h,
                half_torso_w,
            )
            upper_zone_draw.rectangle(
                [
                    max(0, cx_torso - int(half_torso_w * 1.35)),
                    max(0, int(sh_top - torso_h * 0.05)),
                    min(w, cx_torso + int(half_torso_w * 1.35)),
                    min(h, int(sh_top + torso_h * 0.62)),
                ],
                fill=255,
            )

        torso_np = np.array(torso_poly_img, dtype=np.uint8)
        upper_zone_np = np.array(upper_zone_img, dtype=np.uint8) > 128

        if mask_target == "upper_clothes":
            cloth_raw = np.isin(seg_map, [4, 8])
            dress_m = seg_map == 7
            cloth_raw = cloth_raw | (dress_m & upper_zone_np)
            lower_cloth_protect = np.isin(seg_map, [5, 6]) | (
                dress_m & ~upper_zone_np
            )
        else:
            cloth_raw = np.isin(
                seg_map, [4, 5, 6, 7, 8, 9, 10, 17]
            )
            lower_cloth_protect = np.zeros_like(cloth_raw)

        clothes_np = np.array(
            Image.fromarray(cloth_raw.astype(np.uint8) * 255, mode="L").filter(
                ImageFilter.MaxFilter(15)
            ),
            dtype=np.uint8,
        )
        torso_np = np.array(
            Image.fromarray(torso_np, mode="L").filter(
                ImageFilter.MaxFilter(5)
            ),
            dtype=np.uint8,
        )
        active_np = np.maximum(clothes_np, torso_np)

        person_np = (seg_map != 0).astype(np.uint8) * 255
        person_area = np.array(
            Image.fromarray(person_np, mode="L").filter(
                ImageFilter.MaxFilter(11)
            ),
            dtype=np.uint8,
        )
        if person_box_from_pose:
            person_box_np = np.array(person_box_area, dtype=np.uint8)
            person_area[person_box_np <= 128] = 0
        try:
            import cv2

            person_area = cv2.morphologyEx(
                person_area,
                cv2.MORPH_CLOSE,
                np.ones((25, 25), dtype=np.uint8),
            )
            inverted = cv2.bitwise_not(person_area)
            labels_n, labels, stats, _ = cv2.connectedComponentsWithStats(
                inverted, connectivity=8
            )
            for label_idx in range(1, labels_n):
                x0, y0, bw, bh, area = stats[label_idx]
                touches_border = (
                    x0 == 0
                    or y0 == 0
                    or x0 + bw == w
                    or y0 + bh == h
                )
                if not touches_border and area < int(w * h * 0.03):
                    person_area[labels == label_idx] = 255
            person_area = cv2.dilate(
                person_area, np.ones((5, 5), dtype=np.uint8), iterations=1
            )
        except Exception as e:
            print(f"person silhouette warn: {e}")
        if np.count_nonzero(person_area) < int(w * h * 0.02):
            person_area = np.full((h, w), 255, dtype=np.uint8)

        active_np[person_area <= 128] = 0
        if mask_target == "all_clothes" and expand_body:
            limb_pose_np = np.array(limb_pose_area, dtype=np.uint8)
            expand_np = np.maximum(limb_pose_np, body_hull_np)
            if person_box_from_pose:
                expand_np[person_box_np <= 128] = 0
            try:
                import cv2

                expand_np = cv2.dilate(
                    expand_np,
                    np.ones((9, 9), dtype=np.uint8),
                    iterations=1,
                )
            except Exception:
                pass
            active_np = np.maximum(active_np, expand_np)
        if mask_target == "all_clothes" and not preserve_limbs:
            try:
                import cv2

                person_full_area = cv2.dilate(
                    person_area,
                    np.ones((15, 15), dtype=np.uint8),
                    iterations=1,
                )
            except Exception:
                person_full_area = person_area
            active_np = np.maximum(active_np, person_full_area)
            limb_pose_np = np.array(limb_pose_area, dtype=np.uint8)
            if person_box_from_pose:
                limb_pose_np[person_box_np <= 128] = 0
            active_np = np.maximum(active_np, limb_pose_np)
            if person_box_from_pose:
                body_hull_np[person_box_np <= 128] = 0
            try:
                import cv2

                active_np = np.maximum(
                    active_np,
                    cv2.dilate(
                        body_hull_np,
                        np.ones((9, 9), dtype=np.uint8),
                        iterations=1,
                    ),
                )
            except Exception:
                active_np = np.maximum(active_np, body_hull_np)
        elif mask_target == "upper_clothes" and not preserve_limbs:
            upper_body_area = np.where(
                (person_area > 128)
                & (
                    np.arange(h, dtype=np.int32)[:, None]
                    < int(sh_top + torso_h * 0.82)
                ),
                255,
                0,
            ).astype(np.uint8)
            try:
                import cv2

                upper_body_area = cv2.dilate(
                    upper_body_area,
                    np.ones((15, 15), dtype=np.uint8),
                    iterations=1,
                )
            except Exception:
                pass
            active_np = np.maximum(active_np, upper_body_area)

        head_area_np = np.array(head_area, dtype=np.uint8)
        if not head_area_from_pose:
            head_area_np = np.zeros((h, w), dtype=np.uint8)
            head_area_np[: int(h * 0.40), int(w * 0.10) : int(w * 0.90)] = 255

        protect_np = np.where(head_area_np > 128, seg_head_np, 0)
        if head_area_from_pose:
            protect_np = np.maximum(protect_np, head_area_np)

        limb_classes = [12, 13, 14, 15]
        limb_raw_np = np.isin(seg_map, limb_classes)
        limbs_np = limb_raw_np.astype(np.uint8) * 255
        limbs_np = np.array(
            Image.fromarray(limbs_np, mode="L").filter(
                ImageFilter.MaxFilter(3)
            ),
            dtype=np.uint8,
        )
        skin_ref_np = np.isin(seg_map, [11, 14, 15])
        skin_ref_rgb = None
        rgb_dist = None
        limbs_skin_np = limbs_np
        if np.count_nonzero(skin_ref_np) >= 200:
            skin_ref_rgb = np.median(
                img_np[skin_ref_np].astype(np.float32), axis=0
            )
            rgb_dist = np.sqrt(
                np.sum(
                    np.square(img_np.astype(np.float32) - skin_ref_rgb),
                    axis=2,
                )
            )
            limbs_skin_np = np.where(
                limb_raw_np & (rgb_dist < 75.0), 255, 0
            ).astype(np.uint8)
            limbs_skin_np = np.array(
                Image.fromarray(limbs_skin_np, mode="L").filter(
                    ImageFilter.MaxFilter(3)
                ),
                dtype=np.uint8,
            )
        accessory_classes = [] if mask_target == "all_clothes" else [9, 10, 16]
        accessory_np = np.isin(seg_map, accessory_classes).astype(np.uint8) * 255

        if preserve_limbs:
            protect_np = np.maximum(protect_np, limbs_skin_np)
        protect_np = np.maximum(protect_np, accessory_np)
        protect_np = np.maximum(
            protect_np, lower_cloth_protect.astype(np.uint8) * 255
        )

        hand_guard = Image.fromarray(np.zeros((h, w), dtype=np.uint8), "L")
        hand_draw = ImageDraw.Draw(hand_guard)
        hand_r = max(22, int(half_torso_w * 0.28))
        for pt in wrist_pts:
            x, y = float(pt[0]), float(pt[1])
            hand_draw.ellipse(
                [x - hand_r, y - hand_r, x + hand_r, y + hand_r], fill=255
            )
        hand_guard_np = np.array(hand_guard)
        if rgb_dist is not None:
            hand_guard_np = np.where(
                (hand_guard_np > 0) & (rgb_dist < 85.0), 255, 0
            ).astype(np.uint8)
            hand_guard_np = np.array(
                Image.fromarray(hand_guard_np, mode="L").filter(
                    ImageFilter.MaxFilter(3)
                ),
                dtype=np.uint8,
            )
        protect_np = np.maximum(protect_np, hand_guard_np)

        cloth_context_np = np.array(
            Image.fromarray(cloth_raw.astype(np.uint8) * 255, mode="L").filter(
                ImageFilter.MaxFilter(25)
            ),
            dtype=np.uint8,
        )
        protect_np[cloth_context_np > 128] = 0

        protect_np = np.maximum(protect_np, hand_guard_np)
        protect_np = np.maximum(
            protect_np, lower_cloth_protect.astype(np.uint8) * 255
        )

        active_np[protect_np > 128] = 0
        skin_sample_np = np.isin(seg_map, [11, 14, 15])
        skin_sample_np &= active_np <= 128
        skin_rgb = None
        if np.count_nonzero(skin_sample_np) >= 200:
            skin_rgb = np.median(
                img_np[skin_sample_np].astype(np.float32), axis=0
            ).tolist()
        elif skin_ref_rgb is not None:
            skin_rgb = skin_ref_rgb.tolist()

        mask_ratio = float(np.count_nonzero(active_np) / float(w * h))
        if mask_ratio < 0.012:
            active_np = np.where(person_area > 128, torso_np, 0)
            active_np[protect_np > 128] = 0
            mask_ratio = float(np.count_nonzero(active_np) / float(w * h))

        blend_source_np = np.where(person_area > 128, active_np, 0)
        blend_np = np.array(
            Image.fromarray(blend_source_np, mode="L").filter(
                ImageFilter.GaussianBlur(12)
            ),
            dtype=np.uint8,
        )
        blend_allowed_np = np.array(
            Image.fromarray(person_area, mode="L").filter(
                ImageFilter.MaxFilter(3)
            ),
            dtype=np.uint8,
        )
        blend_np[blend_allowed_np <= 128] = 0

        class_ids, class_counts = np.unique(seg_map, return_counts=True)
        anatomy_info = {
            "seg_classes": {
                str(int(class_id)): int(count)
                for class_id, count in zip(class_ids, class_counts)
            },
            "sh_top": sh_top,
            "torso_h": torso_h,
            "cx_torso": cx_torso,
            "half_torso_w": half_torso_w,
            "mask_ratio": mask_ratio,
            "pose_ok": pose_ok,
            "people": len(people_kpts),
            "person_box_from_pose": person_box_from_pose,
            "person_box_bounds": person_box_bounds,
            "skin_rgb": skin_rgb,
        }
        return (
            Image.fromarray(active_np, mode="L"),
            pose_img,
            anatomy_info,
            Image.fromarray(blend_np, mode="L"),
        )

    @staticmethod
    def _generic_negative_prompt():
        return (
            "bad anatomy, extra limbs, extra fingers, missing fingers, "
            "deformed hands, distorted torso, extra breasts, bad nipples, "
            "cut arms, blurry, lowres, worst quality, low quality, watermark"
        )

    def _fit_prompt_tokens(self, text, max_tokens=75):
        """Recorta términos separados por coma desde el final hasta que el texto quepa en el límite de CLIP."""
        tokenizer = self.inpaint.tokenizer
        parts = [p.strip() for p in str(text or "").split(",") if p.strip()]
        while parts:
            candidate = ", ".join(parts)
            n = len(tokenizer(candidate, truncation=False)["input_ids"])
            if n <= max_tokens + 2:  # +2 por BOS/EOS
                return candidate
            parts.pop()
        return ""

    def _count_prompt_tokens(self, text):
        tokenizer = self.inpaint.tokenizer
        return len(tokenizer(str(text or ""), truncation=False)["input_ids"])

    @modal.method()
    def generate(self, payload: dict) -> str:
        from PIL import Image

        prompt = str(payload.get("prompt", "")).strip()
        clean_prompt = (
            prompt
            + ", same person, same face, same pose, photorealistic skin texture"
        )
        negative_prompt = (
            payload.get("negative_prompt") or self._generic_negative_prompt()
        )
        before_p = self._count_prompt_tokens(clean_prompt)
        before_n = self._count_prompt_tokens(negative_prompt)
        clean_prompt = self._fit_prompt_tokens(clean_prompt)
        negative_prompt = self._fit_prompt_tokens(negative_prompt)
        after_p = self._count_prompt_tokens(clean_prompt)
        after_n = self._count_prompt_tokens(negative_prompt)
        print(
            "Prompt tokens:", before_p, "->", after_p,
            "| negative:", before_n, "->", after_n,
        )
        steps = max(20, min(42, int(payload.get("steps") or 30)))
        cfg_scale = max(3.0, min(7.0, float(payload.get("cfg_scale") or 5.0)))
        lora_scale = max(
            0.0, min(1.0, float(payload.get("lora_scale") or 0.0))
        )
        mask_target = payload.get("mask_target", "all_clothes")
        inpaint_pipe = self.inpaint
        detail_ready = self.detail_adapter_loaded

        init_images = payload.get("init_images") or []

        if not init_images:
            target_w, target_h = get_sdxl_native_dimensions(
                int(payload.get("width", 832)),
                int(payload.get("height", 1216)),
            )
            out_img = self._get_txt2img()(
                prompt=clean_prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=steps,
                guidance_scale=cfg_scale,
                width=target_w,
                height=target_h,
            ).images[0]
            buf = io.BytesIO()
            out_img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode("utf-8")

        raw_img = init_images[0]
        if "," in raw_img:
            raw_img = raw_img.split(",", 1)[1]
        orig_img = Image.open(
            io.BytesIO(base64.b64decode(raw_img))
        ).convert("RGB")
        orig_w, orig_h = orig_img.size

        sdxl_w, sdxl_h = get_sdxl_native_dimensions(orig_w, orig_h)
        work_img = orig_img.resize((sdxl_w, sdxl_h), Image.LANCZOS)
        expand_body = bool(
            payload.get("expand_body") or payload.get("expandBody")
        )
        full_body = (
            mask_target == "full_body"
            or bool(payload.get("full_body") or payload.get("fullBody"))
        )
        frame_bounds = None
        if expand_body and mask_target == "all_clothes" and not full_body:
            from PIL import ImageFilter

            frame_scale = max(
                0.60,
                min(0.95, float(payload.get("frame_scale") or 0.82)),
            )
            scaled_w = max(1, int(sdxl_w * frame_scale))
            scaled_h = max(1, int(sdxl_h * frame_scale))
            offset_x = (sdxl_w - scaled_w) // 2
            offset_y = max(0, int(sdxl_h * 0.02))
            frame = work_img.resize((scaled_w, scaled_h), Image.LANCZOS)
            canvas = work_img.filter(ImageFilter.GaussianBlur(36))
            canvas.paste(frame, (offset_x, offset_y))
            work_img = canvas
            frame_bounds = (
                offset_x,
                offset_y,
                offset_x + scaled_w,
                offset_y + scaled_h,
            )

        if mask_target == "enhance":
            try:
                detail_restore = max(
                    0.0,
                    min(
                        0.5,
                        float(payload.get("detail_restore") or 0.45),
                    ),
                )
                color_restore = max(
                    0.0,
                    min(
                        1.0,
                        float(payload.get("color_restore") or 0.95),
                    ),
                )
                generated = self._enhance_photo(
                    orig_img,
                    detail_restore=detail_restore,
                    color_restore=color_restore,
                )
                buf = io.BytesIO()
                generated.save(buf, format="PNG")
                return base64.b64encode(buf.getvalue()).decode("utf-8")
            except Exception as e:
                print(f"RealESRGAN fallback warn: {e}")

            import cv2
            import numpy as np
            from PIL import ImageEnhance, ImageFilter

            source_arr = cv2.cvtColor(
                np.array(work_img), cv2.COLOR_RGB2BGR
            )
            clean_source = cv2.fastNlMeansDenoisingColored(
                source_arr, None, 5, 5, 7, 21
            )
            work_img = Image.fromarray(
                cv2.cvtColor(clean_source, cv2.COLOR_BGR2RGB)
            )

            enhance_strength = max(
                0.12,
                min(0.55, float(payload.get("denoising_strength") or 0.32)),
            )
            generator = None
            seed = payload.get("seed")
            if seed is not None:
                generator = self._torch.Generator(device="cuda").manual_seed(
                    int(seed)
                )
            try:
                (
                    _,
                    pose_img,
                    enhance_anatomy,
                    _,
                ) = self._analyze_anatomy_and_mask(
                    work_img,
                    mask_target="all_clothes",
                    preserve_limbs=True,
                )
            except Exception:
                pose_img = Image.new("RGB", work_img.size, (0, 0, 0))
                enhance_anatomy = {}
            if detail_ready:
                inpaint_pipe.set_adapters(
                    ["detail_xl"], adapter_weights=[lora_scale]
                )
            control_scale = (
                0.65 if enhance_anatomy.get("pose_ok") else 0.0
            )
            full_mask = Image.new("L", work_img.size, 255)
            print(
                "Enhance request:",
                f"strength={enhance_strength} steps={steps} cfg={cfg_scale}",
                f"pose={enhance_anatomy.get('pose_ok')}",
                f"control={control_scale}",
            )
            generated = inpaint_pipe(
                prompt=clean_prompt,
                negative_prompt=negative_prompt,
                image=work_img,
                mask_image=full_mask,
                control_image=pose_img,
                controlnet_conditioning_scale=control_scale,
                control_guidance_start=0.0,
                control_guidance_end=0.85,
                strength=enhance_strength,
                generator=generator,
                num_inference_steps=steps,
                guidance_scale=cfg_scale,
                width=sdxl_w,
                height=sdxl_h,
            ).images[0]
            generated_arr = cv2.cvtColor(
                np.array(generated), cv2.COLOR_RGB2BGR
            )
            generated_arr = cv2.fastNlMeansDenoisingColored(
                generated_arr, None, 8, 8, 7, 21
            )
            generated = Image.fromarray(
                cv2.cvtColor(generated_arr, cv2.COLOR_BGR2RGB)
            )
            generated = ImageEnhance.Contrast(generated).enhance(1.03)
            generated = ImageEnhance.Color(generated).enhance(1.02)
            generated = generated.filter(
                ImageFilter.UnsharpMask(
                    radius=1.5, percent=100, threshold=2
                )
            )
            buf = io.BytesIO()
            generated.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode("utf-8")

        analysis_target = "all_clothes" if full_body else mask_target
        (
            active_mask,
            pose_img,
            anatomy_info,
            blend_mask,
        ) = self._analyze_anatomy_and_mask(
            work_img,
            mask_target=analysis_target,
            preserve_limbs=payload.get("preserve_limbs") is not False,
            expand_body=expand_body or full_body,
        )
        mask_ratio = float(anatomy_info.get("mask_ratio", 0.0))
        if mask_ratio < 0.008:
            raise ValueError(
                "No se detectó una zona de ropa válida para editar."
            )

        if detail_ready:
            inpaint_pipe.set_adapters(
                ["detail_xl"], adapter_weights=[lora_scale]
            )

        control_scale = max(
            0.0,
            min(
                1.5,
                float(
                    payload.get(
                        "control_scale",
                        0.95 if anatomy_info.get("pose_ok") else 0.0,
                    )
                ),
            ),
        )
        generator = None
        seed = payload.get("seed")
        if seed is not None:
            generator = self._torch.Generator(device="cuda").manual_seed(
                int(seed)
            )
        print(
            "Inpaint request:",
            f"mask_target={mask_target}",
            f"mask={mask_ratio:.3f}",
            f"pose={anatomy_info.get('pose_ok')}",
            f"strength=1.0 steps={steps} cfg={cfg_scale}",
            f"control={control_scale}",
        )

        generated = inpaint_pipe(
            prompt=clean_prompt,
            negative_prompt=negative_prompt,
            image=work_img,
            mask_image=active_mask,
            control_image=pose_img,
            controlnet_conditioning_scale=control_scale,
            control_guidance_start=0.0,
            control_guidance_end=0.95,
            strength=1.0,
            generator=generator,
            num_inference_steps=steps,
            guidance_scale=cfg_scale,
            width=sdxl_w,
            height=sdxl_h,
        ).images[0]

        skin_rgb = anatomy_info.get("skin_rgb")
        if payload.get("skin_pre_adapt", True) and skin_rgb:
            import numpy as np

            gen_np = np.array(generated).astype(np.float32)
            active_bool = np.array(active_mask) > 128
            if np.count_nonzero(active_bool) >= 500:
                target_rgb = np.array(skin_rgb, dtype=np.float32)
                gen_rgb = np.median(gen_np[active_bool], axis=0)
                desired_rgb = gen_rgb * 0.10 + target_rgb * 0.90
                ratio = np.clip(
                    desired_rgb / np.maximum(gen_rgb, 1.0), 0.70, 1.32
                )
                gen_np[active_bool] = np.clip(
                    gen_np[active_bool] * ratio, 0.0, 255.0
                )
                generated = Image.fromarray(gen_np.astype(np.uint8))

        blend_mode = str(payload.get("blend_mode") or "seamless").lower()
        seamless_ok = False
        if blend_mode == "seamless":
            try:
                import cv2
                import numpy as np

                active_np = np.array(active_mask, dtype=np.uint8)
                ys, xs = np.where(active_np > 0)
                if len(xs) > 200:
                    center = (
                        int(np.clip(xs.mean(), 0, sdxl_w - 1)),
                        int(np.clip(ys.mean(), 0, sdxl_h - 1)),
                    )
                    generated = Image.fromarray(
                        cv2.cvtColor(
                            cv2.seamlessClone(
                                cv2.cvtColor(
                                    np.array(generated), cv2.COLOR_RGB2BGR
                                ),
                                cv2.cvtColor(
                                    np.array(work_img), cv2.COLOR_RGB2BGR
                                ),
                                active_np,
                                center,
                                cv2.NORMAL_CLONE,
                            ),
                            cv2.COLOR_BGR2RGB,
                        )
                    )
                seamless_ok = True
            except Exception as e:
                print(f"seamless blend warn: {e}")

        if blend_mode == "raw":
            first_stage = generated
        else:
            first_stage = (
                generated
                if seamless_ok
                else Image.composite(generated, work_img, blend_mask)
            )

        debug_outpaint_mask = None
        debug_outpaint_pose = None
        debug_first_stage = None
        if full_body:
            from PIL import ImageDraw, ImageFilter
            debug_first_stage = first_stage

            frame_scale = max(
                0.55,
                min(0.90, float(payload.get("frame_scale") or 0.80)),
            )
            scaled_w = max(1, int(sdxl_w * frame_scale))
            scaled_h = max(1, int(sdxl_h * frame_scale))
            offset_x = (sdxl_w - scaled_w) // 2
            offset_y = max(0, int(sdxl_h * 0.01))
            frame = first_stage.resize(
                (scaled_w, scaled_h), Image.LANCZOS
            )
            outpaint_img = first_stage.resize(
                (sdxl_w, sdxl_h), Image.LANCZOS
            ).filter(ImageFilter.GaussianBlur(28))
            outpaint_img.paste(frame, (offset_x, offset_y))

            try:
                (
                    _,
                    outpaint_pose_img,
                    outpaint_anatomy,
                    _,
                ) = self._analyze_anatomy_and_mask(
                    outpaint_img,
                    mask_target="all_clothes",
                    preserve_limbs=False,
                    expand_body=True,
                )
            except Exception as e:
                print(f"full body pose warn: {e}")
                outpaint_pose_img = Image.new(
                    "RGB", (sdxl_w, sdxl_h), (0, 0, 0)
                )
                outpaint_anatomy = {}

            outpaint_mask_img = Image.new("L", (sdxl_w, sdxl_h), 255)
            mask_draw = ImageDraw.Draw(outpaint_mask_img)
            inner_margin = max(4, int(min(sdxl_w, sdxl_h) * 0.008))
            mask_draw.rectangle(
                [
                    offset_x + inner_margin,
                    offset_y + inner_margin,
                    offset_x + scaled_w - inner_margin,
                    offset_y + scaled_h - inner_margin,
                ],
                fill=0,
            )
            outpaint_mask_img = outpaint_mask_img.filter(
                ImageFilter.GaussianBlur(4)
            )
            debug_outpaint_mask = outpaint_mask_img
            debug_outpaint_pose = outpaint_pose_img

            outpaint_generator = None
            if seed is not None:
                outpaint_generator = self._torch.Generator(
                    device="cuda"
                ).manual_seed(int(seed) + 1000)
            outpaint_steps = max(
                20,
                min(
                    38,
                    int(payload.get("outpaint_steps") or max(22, steps - 6)),
                ),
            )
            outpaint_control = max(
                0.0,
                min(
                    1.5,
                    float(
                        payload.get(
                            "outpaint_control_scale",
                            1.05
                            if outpaint_anatomy.get("pose_ok")
                            else 0.0,
                        )
                    ),
                ),
            )
            outpaint_prompt = (
                "photorealistic fully nude woman, same face identity, "
                "same seated upper-body pose, complete full body composition, "
                "bare abdomen and navel, bare hips, thighs, knees and legs, "
                "legs continuing naturally downward, same car interior and "
                "background, seamless continuation, realistic skin texture, "
                "soft natural lighting, uncensored"
            )
            blocked_negative_terms = (
                "different pose",
                "changed pose",
                "altered body position",
                "moved arms",
                "moved legs",
                "changed camera angle",
                "zoomed crop",
                "changed framing",
            )
            outpaint_negative = ", ".join(
                part.strip()
                for part in negative_prompt.split(",")
                if part.strip()
                and not any(
                    term in part.lower()
                    for term in blocked_negative_terms
                )
            )
            outpaint_prompt = self._fit_prompt_tokens(outpaint_prompt)
            outpaint_negative = self._fit_prompt_tokens(outpaint_negative)
            print(
                "Full body outpaint:",
                f"scale={frame_scale:.2f} frame={scaled_w}x{scaled_h}",
                f"steps={outpaint_steps} control={outpaint_control}",
            )
            outpainted = inpaint_pipe(
                prompt=outpaint_prompt,
                negative_prompt=outpaint_negative,
                image=outpaint_img,
                mask_image=outpaint_mask_img,
                control_image=outpaint_pose_img,
                controlnet_conditioning_scale=outpaint_control,
                control_guidance_start=0.0,
                control_guidance_end=0.90,
                strength=1.0,
                generator=outpaint_generator,
                num_inference_steps=outpaint_steps,
                guidance_scale=cfg_scale,
                width=sdxl_w,
                height=sdxl_h,
            ).images[0]
            final_work = outpainted
        else:
            final_work = first_stage

        if full_body:
            # El lienzo cambió (outpaint): devolver todo lo generado.
            final_out = final_work.resize((orig_w, orig_h), Image.LANCZOS)
        else:
            # Componer solo la zona editada sobre la base intacta, a
            # resolución original, para no degradar cara/fondo no editados.
            from PIL import ImageFilter

            soft_mask = active_mask.filter(ImageFilter.MaxFilter(5)).filter(
                ImageFilter.GaussianBlur(8)
            )
            soft_mask_hr = soft_mask.resize((orig_w, orig_h), Image.LANCZOS)
            gen_hr = final_work.resize((orig_w, orig_h), Image.LANCZOS)
            if frame_bounds is not None:
                # expand_body recompuso el lienzo con la foto reducida:
                # reconstruir ese mismo lienzo a resolución original para
                # que el composite quede alineado con la geometría generada.
                hr_fs = frame_scale
                hr_fw = max(1, int(orig_w * hr_fs))
                hr_fh = max(1, int(orig_h * hr_fs))
                hr_ox = (orig_w - hr_fw) // 2
                hr_oy = max(0, int(orig_h * 0.02))
                hr_blur = max(8, int(36 * orig_w / sdxl_w))
                base_hr = orig_img.filter(
                    ImageFilter.GaussianBlur(hr_blur)
                )
                base_hr.paste(
                    orig_img.resize((hr_fw, hr_fh), Image.LANCZOS),
                    (hr_ox, hr_oy),
                )
            else:
                base_hr = orig_img
            final_out = Image.composite(gen_hr, base_hr, soft_mask_hr)
            print(
                "Final composite:",
                f"orig={orig_w}x{orig_h}",
                f"sdxl={sdxl_w}x{sdxl_h}",
                "mode=hr_composite",
                f"canvas={frame_bounds is not None}",
            )

        if payload.get("debug"):
            import json

            def pil_to_b64(img, fmt="PNG"):
                out = io.BytesIO()
                img.save(out, format=fmt)
                return base64.b64encode(out.getvalue()).decode("utf-8")

            return json.dumps(
                {
                    "image": pil_to_b64(final_out),
                    "mask": pil_to_b64(active_mask),
                    "blend_mask": pil_to_b64(blend_mask),
                    "pose": pil_to_b64(pose_img),
                    "first_stage": (
                        pil_to_b64(debug_first_stage)
                        if debug_first_stage is not None
                        else None
                    ),
                    "outpaint_mask": (
                        pil_to_b64(debug_outpaint_mask)
                        if debug_outpaint_mask is not None
                        else None
                    ),
                    "outpaint_pose": (
                        pil_to_b64(debug_outpaint_pose)
                        if debug_outpaint_pose is not None
                        else None
                    ),
                    "anatomy": anatomy_info,
                }
            )

        buf = io.BytesIO()
        final_out.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")


# =====================================================================
# MOTOR 2: WAN 2.1 I2V (MAGESPACE BF16 + ESCALADO 0-255 ANTI-VIDEO NEGRO)
# =====================================================================
@app.cls(
    gpu="A100-80GB",
    volumes={VOLUME_PATH: vol},
    scaledown_window=60,
    timeout=900,
)
class VideoEngine:
    @modal.enter()
    def setup(self):
        import urllib.request
        import torch
        from diffusers import (
            AutoencoderKLWan,
            UniPCMultistepScheduler,
            WanImageToVideoPipeline,
        )
        from huggingface_hub import snapshot_download
        from transformers import CLIPVisionModelWithProjection

        wan_cache = f"{VOLUME_PATH}/wan21_magespace_bf16"
        lora_dir = f"{VOLUME_PATH}/wan_loras"
        os.makedirs(wan_cache, exist_ok=True)
        os.makedirs(lora_dir, exist_ok=True)

        marker = f"{wan_cache}/.ready"
        if not os.path.exists(marker):
            snapshot_download(
                repo_id=WAN_LIGHTNING_BF16_REPO,
                local_dir=wan_cache,
            )
            with open(marker, "w") as f:
                f.write("ok")
            vol.commit()

        self.lora_dir = lora_dir
        self.lora_paths = {}
        for lora_id in CIVITAI_WAN_LORAS:
            lpath = f"{lora_dir}/{lora_id}.safetensors"
            if os.path.exists(lpath) and os.path.getsize(lpath) > 10000:
                self.lora_paths[lora_id] = lpath
        vol.commit()

        image_encoder = CLIPVisionModelWithProjection.from_pretrained(
            wan_cache,
            subfolder="image_encoder",
            torch_dtype=torch.float32,
            local_files_only=True,
        )
        vae = AutoencoderKLWan.from_pretrained(
            wan_cache,
            subfolder="vae",
            torch_dtype=torch.float32,
            local_files_only=True,
        )
        self.pipe = WanImageToVideoPipeline.from_pretrained(
            wan_cache,
            vae=vae,
            image_encoder=image_encoder,
            torch_dtype=torch.bfloat16,
            local_files_only=True,
        )
        self.pipe.scheduler = UniPCMultistepScheduler.from_config(
            self.pipe.scheduler.config,
            flow_shift=8.0,
        )
        self.pipe.vae.enable_tiling()
        self.pipe.to("cuda")
        self.current_loaded_lora = None
        try:
            from ultralytics import YOLO

            self.pose_model = YOLO("/root/models/yolov8n-pose.pt")
        except Exception as e:
            print(f"Video pose model warn: {e}")
            self.pose_model = None

    def _ensure_lora_path(self, lora_id: str):
        url = CIVITAI_WAN_LORAS.get(lora_id)
        if not url:
            return None
        lpath = self.lora_paths.get(lora_id) or os.path.join(
            self.lora_dir, f"{lora_id}.safetensors"
        )
        if not (os.path.exists(lpath) and os.path.getsize(lpath) > 10000):
            import urllib.request

            try:
                print(f"Descargando LoRA {lora_id} bajo demanda...")
                urllib.request.urlretrieve(url, lpath)
                vol.commit()
            except Exception as e:
                print(f"LoRA download failed {lora_id}: {e}")
                try:
                    if os.path.exists(lpath):
                        os.remove(lpath)
                except OSError:
                    pass
                return None
            if not (
                os.path.exists(lpath) and os.path.getsize(lpath) > 10000
            ):
                return None
        self.lora_paths[lora_id] = lpath
        return lpath

    def _select_lora_for_request(self, payload: dict):
        lora_id = payload.get("lora_id")
        if lora_id == "none":
            return None
        if lora_id in CIVITAI_WAN_LORAS:
            return lora_id
        prompt_low = str(payload.get("prompt", "")).lower()
        if "str1p" in prompt_low or "takes off" in prompt_low:
            return "str1p"
        if "revealing her breasts" in prompt_low or "pulling up" in prompt_low:
            return "tittydrop"
        if "covers the view" in prompt_low:
            return "clothes_on_off"
        if "fondling" in prompt_low or "groping" in prompt_low:
            return "boob_grab"
        return "bounce"

    @staticmethod
    def _to_uint8_rgb(frame):
        import numpy as np
        from PIL import Image

        if isinstance(frame, Image.Image):
            arr = np.array(frame, dtype=np.float32)
        else:
            arr = np.array(frame, dtype=np.float32)
        arr = np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0)
        if arr.size == 0:
            raise ValueError("Frame vacío devuelto por Wan")
        if float(arr.max()) <= 1.05:
            arr = arr * 255.0
        return np.clip(arr, 0.0, 255.0).astype(np.uint8)

    @staticmethod
    def _decode_payload_image(raw_img):
        from PIL import Image

        if "," in raw_img:
            raw_img = raw_img.split(",", 1)[1]
        return Image.open(
            io.BytesIO(base64.b64decode(raw_img))
        ).convert("RGB")

    @staticmethod
    def _ellipse_mask(size, feather=16):
        from PIL import Image, ImageDraw, ImageFilter

        w, h = size
        mask = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse(
            [
                int(w * 0.04),
                int(h * 0.02),
                int(w * 0.96),
                int(h * 0.98),
            ],
            fill=255,
        )
        return mask.filter(ImageFilter.GaussianBlur(feather))

    def _detect_face_state(self, pil_img):
        import cv2
        import numpy as np

        w, h = pil_img.size
        face_pts = []
        shoulder_pts = []
        face_box = None
        has_person = False

        if self.pose_model is not None:
            try:
                pose_res = self.pose_model.predict(
                    np.array(pil_img), verbose=False
                )
                if (
                    pose_res
                    and pose_res[0].keypoints is not None
                    and len(pose_res[0].keypoints.xy) > 0
                ):
                    people_kpts = pose_res[0].keypoints.xy.cpu().numpy()
                    raw_conf = getattr(
                        pose_res[0].keypoints, "conf", None
                    )
                    people_conf = (
                        raw_conf.cpu().numpy()
                        if raw_conf is not None
                        else None
                    )
                    person_idx = 0
                    raw_boxes = getattr(pose_res[0], "boxes", None)
                    if raw_boxes is not None and raw_boxes.xyxy is not None:
                        boxes = raw_boxes.xyxy.cpu().numpy()
                        if len(boxes) > 0:
                            areas = (
                                (boxes[:, 2] - boxes[:, 0])
                                * (boxes[:, 3] - boxes[:, 1])
                            )
                            person_idx = int(np.argmax(areas))
                            has_person = True
                    if len(people_kpts) > 0:
                        has_person = True
                    if person_idx < len(people_kpts):
                        kpts = people_kpts[person_idx]
                        conf = (
                            people_conf[person_idx]
                            if people_conf is not None
                            and person_idx < len(people_conf)
                            else None
                        )

                        def kp_ok(idx):
                            if kpts[idx][0] <= 1 or kpts[idx][1] <= 1:
                                return False
                            return (
                                conf is None
                                or float(conf[idx]) >= 0.25
                            )

                        face_pts = [
                            kpts[i] for i in range(5) if kp_ok(i)
                        ]
                        shoulder_pts = [
                            kpts[i] for i in (5, 6) if kp_ok(i)
                        ]
            except Exception as e:
                print(f"Video face pose warn: {e}")

        if face_pts:
            xs = [float(p[0]) for p in face_pts]
            ys = [float(p[1]) for p in face_pts]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            face_h = max(28.0, max_y - min_y)
            x1 = min_x - face_h * 0.80
            x2 = max_x + face_h * 0.80
            y1 = min_y - face_h * 1.45
            y2 = max_y + face_h * 0.85
            if len(shoulder_pts) == 2:
                sh_dist = max(
                    48.0,
                    abs(
                        float(shoulder_pts[0][0])
                        - float(shoulder_pts[1][0])
                    ),
                )
                shoulder_y = (
                    float(shoulder_pts[0][1])
                    + float(shoulder_pts[1][1])
                ) * 0.5
                face_w = max(face_h * 1.65, sh_dist * 0.58)
                cx = (min_x + max_x) * 0.5
                x1 = min(x1, cx - face_w * 0.5)
                x2 = max(x2, cx + face_w * 0.5)
                y1 = min(y1, shoulder_y - sh_dist * 0.92)
                y2 = max(y2, shoulder_y + sh_dist * 0.08)
            face_box = (
                int(max(0, x1)),
                int(max(0, y1)),
                int(min(w, x2)),
                int(min(h, y2)),
            )
        elif len(shoulder_pts) == 2:
            sh_dist = max(
                48.0,
                abs(
                    float(shoulder_pts[0][0])
                    - float(shoulder_pts[1][0])
                ),
            )
            cx = (
                float(shoulder_pts[0][0]) + float(shoulder_pts[1][0])
            ) * 0.5
            shoulder_y = (
                float(shoulder_pts[0][1]) + float(shoulder_pts[1][1])
            ) * 0.5
            face_w = sh_dist * 0.58
            face_h = sh_dist * 0.74
            face_box = (
                int(max(0, cx - face_w * 0.5)),
                int(max(0, shoulder_y - face_h)),
                int(min(w, cx + face_w * 0.5)),
                int(min(h, shoulder_y + sh_dist * 0.08)),
            )

        if not face_pts:
            try:
                gray = cv2.cvtColor(
                    np.array(pil_img), cv2.COLOR_RGB2GRAY
                )
                cascade = cv2.CascadeClassifier(
                    cv2.data.haarcascades
                    + "haarcascade_frontalface_default.xml"
                )
                faces = cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.08,
                    minNeighbors=5,
                    minSize=(28, 28),
                )
                if len(faces) > 0:
                    x, y, fw, fh = max(
                        faces, key=lambda b: int(b[2] * b[3])
                    )
                    face_box = (
                        int(x - fw * 0.10),
                        int(y - fh * 0.10),
                        int(x + fw * 1.10),
                        int(y + fh * 1.10),
                    )
                    face_box = (
                        max(0, face_box[0]),
                        max(0, face_box[1]),
                        min(w, face_box[2]),
                        min(h, face_box[3]),
                    )
                    roi = gray[
                        face_box[1] : face_box[3],
                        face_box[0] : face_box[2],
                    ]
                    eye_cascade = cv2.CascadeClassifier(
                        cv2.data.haarcascades + "haarcascade_eye.xml"
                    )
                    eyes = eye_cascade.detectMultiScale(
                        roi,
                        scaleFactor=1.10,
                        minNeighbors=4,
                        minSize=(8, 8),
                    )
                    touches_border = (
                        face_box[0] <= 6
                        or face_box[1] <= 6
                        or face_box[2] >= w - 6
                        or face_box[3] >= h - 6
                    )
                    status = (
                        "complete"
                        if len(eyes) >= 2 and not touches_border
                        else "partial"
                    )
                    return {
                        "status": status,
                        "face_box": face_box,
                        "face_points": 0,
                        "has_person": has_person,
                    }
            except Exception as e:
                print(f"Video haar face warn: {e}")

        touches_border = False
        if face_box:
            touches_border = (
                face_box[0] <= 6
                or face_box[1] <= 6
                or face_box[2] >= w - 6
                or face_box[3] >= h - 6
            )
        complete = (
            len(face_pts) >= 4
            and not touches_border
            and face_box is not None
        )
        status = "complete" if complete else (
            "partial" if face_pts else "absent"
        )
        return {
            "status": status,
            "face_box": face_box,
            "face_points": len(face_pts),
            "has_person": has_person,
        }

    def _patch_reference_face(self, base_img, ref_img, face_box):
        import numpy as np
        from PIL import Image, ImageFilter

        if not face_box:
            return base_img, False
        ref_state = self._detect_face_state(ref_img)
        ref_box = ref_state.get("face_box")
        if not ref_box or ref_state.get("status") == "absent":
            return base_img, False

        rw, rh = ref_img.size
        pad_x = int((ref_box[2] - ref_box[0]) * 0.18)
        pad_y = int((ref_box[3] - ref_box[1]) * 0.14)
        ref_crop = ref_img.crop(
            (
                max(0, ref_box[0] - pad_x),
                max(0, ref_box[1] - pad_y),
                min(rw, ref_box[2] + pad_x),
                min(rh, ref_box[3] + pad_y),
            )
        )
        x1, y1, x2, y2 = face_box
        box_w, box_h = max(16, x2 - x1), max(16, y2 - y1)
        patch = ref_crop.resize((box_w, box_h), Image.LANCZOS)

        base_region = np.array(
            base_img.crop((x1, y1, x2, y2))
        ).astype(np.float32)
        patch_np = np.array(patch).astype(np.float32)
        base_med = np.median(base_region.reshape(-1, 3), axis=0)
        ref_med = np.maximum(
            np.median(patch_np.reshape(-1, 3), axis=0), 1.0
        )
        ratio = np.clip(base_med / ref_med, 0.72, 1.32)
        patch_np = np.clip(patch_np * ratio, 0, 255)
        patch = Image.fromarray(patch_np.astype(np.uint8))

        out = base_img.copy()
        mask = self._ellipse_mask(patch.size, feather=10)
        out.paste(patch, (x1, y1), mask)
        return out, True

    @staticmethod
    def _sanitize_body_only_prompt(prompt: str) -> str:
        import re

        replacements = [
            (
                r"alluring smile looking at (the )?viewer",
                "keeping the same visible face region and head position",
            ),
            (
                r"with a natural smile and gentle movement",
                "with gentle movement while keeping the same face visibility and head position",
            ),
            (
                r"smiles? at (the )?(camera|viewer)",
                "keeps the same visible face region and head position",
            ),
            (
                r"looks? at (the )?(camera|viewer)",
                "keeps the same visible face region and head position",
            ),
            (
                r"looking at (the )?(camera|viewer)",
                "keeping the same visible face region and head position",
            ),
            (
                r"seductive expression",
                "natural body motion",
            ),
            (
                r"natural smile",
                "gentle body motion",
            ),
            (
                r"smiles?",
                "keeps the same visible face region and head position",
            ),
            (
                r"eye contact( with the camera)?",
                "same visible face region and head position",
            ),
            (
                r"faces? the camera",
                "keeps the same visible face region and head position",
            ),
        ]
        out = str(prompt or "")
        for pattern, replacement in replacements:
            out = re.sub(
                pattern,
                replacement,
                out,
                flags=re.IGNORECASE,
            )
        return out

    @staticmethod
    def _sanitize_face_reference_prompt(prompt: str) -> str:
        import re

        replacements = [
            (
                r"alluring smile looking at (the )?viewer",
                "keeping the same reference face",
            ),
            (
                r"with a natural smile and gentle movement",
                "with gentle movement while keeping the same reference face",
            ),
            (
                r"smiles? at (the )?(camera|viewer)",
                "keeps the same reference face",
            ),
            (
                r"looks? at (the )?(camera|viewer)",
                "keeps the same reference face",
            ),
            (
                r"looking at (the )?(camera|viewer)",
                "keeping the same reference face",
            ),
            (
                r"seductive expression",
                "same neutral expression",
            ),
            (
                r"natural smile",
                "same natural expression",
            ),
            (
                r"smiles?",
                "keeps the same reference face",
            ),
            (
                r"eye contact( with the camera)?",
                "the same reference face",
            ),
            (
                r"faces? the camera",
                "keeps the same reference face",
            ),
        ]
        out = str(prompt or "")
        for pattern, replacement in replacements:
            out = re.sub(
                pattern,
                replacement,
                out,
                flags=re.IGNORECASE,
            )
        return out

    @staticmethod
    def _continuation_prompt(
        lora_id: str, chunk_index: int, total_chunks: int
    ) -> str:
        sequences = {
            "str1p": [
                (
                    "the woman is now topless, keeps eye contact with the "
                    "camera, slowly turns her shoulders, shifts her weight "
                    "and lets her bare breasts move naturally, same body, "
                    "same background, static camera, no camera movement"
                ),
                (
                    "the topless woman continues posing, raises one hand "
                    "through her hair, changes posture slightly and gently "
                    "shakes her breasts, same body, same background, "
                    "static camera, no camera movement"
                ),
                (
                    "for the final segment the topless woman leans slightly "
                    "forward, smiles, brings her shoulders together and "
                    "settles into a confident nude pose, same body, same "
                    "background, static camera, no camera movement"
                ),
            ],
            "tittydrop": [
                (
                    "the woman keeps her top lifted, bare breasts fully "
                    "visible, gently bounces them and changes her posture, "
                    "same body, same background, static camera"
                ),
                (
                    "the topless woman adjusts her lifted top with one hand, "
                    "turns slightly and lets her breasts move naturally, "
                    "same body, same background, static camera"
                ),
                (
                    "for the final segment the topless woman lowers her "
                    "hands, smiles at the camera and settles into a natural "
                    "pose, same body, same background, static camera"
                ),
            ],
            "clothes_on_off": [
                (
                    "the woman is now completely nude, slowly turns her "
                    "shoulders and hips, moves naturally and keeps eye "
                    "contact, same body, same background, static camera"
                ),
                (
                    "the nude woman takes a small step in place, changes "
                    "posture, runs one hand through her hair and keeps "
                    "moving naturally, same body, same background, "
                    "static camera"
                ),
                (
                    "for the final segment the nude woman faces the camera, "
                    "smiles, lifts her chest slightly and settles into a "
                    "confident pose, same body, same background, "
                    "static camera"
                ),
            ],
            "bounce": [
                (
                    "the nude woman changes rhythm, rolls her hips slowly "
                    "and lets her breasts sway with realistic physics, "
                    "same body, same background, static camera"
                ),
                (
                    "the nude woman leans forward slightly, shakes her "
                    "breasts gently, then returns upright while smiling, "
                    "same body, same background, static camera"
                ),
                (
                    "for the final segment the nude woman slows down, "
                    "settles into a sensual pose and keeps subtle natural "
                    "breast motion, same body, same background, "
                    "static camera"
                ),
            ],
            "boob_grab": [
                (
                    "the woman lifts her bare breasts with both hands, "
                    "changes pressure gently and looks at the camera, "
                    "same body, same background, static camera"
                ),
                (
                    "the woman slides her fingertips around her breasts, "
                    "presses them softly together and smiles seductively, "
                    "same body, same background, static camera"
                ),
                (
                    "for the final segment the woman releases one hand, "
                    "keeps the other cupping her breast and settles into a "
                    "confident nude pose, same body, same background, "
                    "static camera"
                ),
            ],
        }
        seq = sequences.get(
            lora_id,
            [
                (
                    "continue the same natural motion with a slightly new "
                    "pose, preserve the same body, clothing state, face and "
                    "background, static camera"
                ),
                (
                    "finish the motion naturally, preserve the same body, "
                    "clothing state, face and background, static camera"
                ),
            ],
        )
        idx = min(max(chunk_index - 1, 0), len(seq) - 1)
        return seq[idx]

    @staticmethod
    def _body_only_continuation_prompt(
        lora_id: str, chunk_index: int
    ) -> str:
        sequences = {
            "str1p": [
                (
                    "the woman keeps her head visibility unchanged from the initial frame, "
                    "turns her shoulders slowly, shifts her weight and "
                    "lets her bare breasts move naturally, same initial framing"
                ),
                (
                    "the topless woman changes posture, moves one arm "
                    "across her torso and gently shakes her breasts while "
                    "the face remains at the same visibility and head position"
                ),
                (
                    "for the final segment the woman leans her torso "
                    "slightly forward, brings her shoulders together and "
                    "settles into a natural nude body pose, same initial framing"
                ),
            ],
            "tittydrop": [
                (
                    "the woman keeps her top lifted and her face at the "
                    "same visibility and head position, gently bounces her breasts and changes "
                    "her body posture, same initial framing"
                ),
                (
                    "the topless woman adjusts her lifted top with one "
                    "hand, turns her torso slightly and lets her breasts "
                    "move naturally, face remains at the same visibility and head position"
                ),
                (
                    "for the final segment the woman lowers her hands, "
                    "keeps her head visibility unchanged and settles into a natural "
                    "topless body pose, same initial framing"
                ),
            ],
            "clothes_on_off": [
                (
                    "the nude woman keeps her face visibility and head position unchanged, "
                    "slowly turns her shoulders and hips and moves her "
                    "body naturally, same initial framing"
                ),
                (
                    "the nude woman takes a small step in place, changes "
                    "posture and moves one arm naturally while the face "
                    "remains at the same visibility and head position"
                ),
                (
                    "for the final segment the nude woman keeps her head "
                    "visibility unchanged, lifts her chest slightly and settles "
                    "into a natural body pose, same initial framing"
                ),
            ],
            "bounce": [
                (
                    "the nude woman keeps her face visibility and head position unchanged, "
                    "rolls her hips slowly and lets her breasts sway with "
                    "realistic physics, same initial framing"
                ),
                (
                    "the nude woman leans her torso forward, shakes her "
                    "breasts gently and returns upright while the face "
                    "remains at the same visibility and head position"
                ),
                (
                    "for the final segment the nude woman slows down, "
                    "settles into a natural pose and keeps subtle breast "
                    "motion, same initial framing"
                ),
            ],
            "boob_grab": [
                (
                    "the woman lifts her bare breasts with both hands and "
                    "keeps her face visibility and head position unchanged, same body and "
                    "background, same initial framing"
                ),
                (
                    "the woman slides her fingertips around her breasts, "
                    "presses them softly together and keeps her head "
                    "visibility unchanged from the initial frame"
                ),
                (
                    "for the final segment the woman releases one hand, "
                    "keeps the other cupping her breast and settles into "
                    "a natural body pose, same initial framing"
                ),
            ],
        }
        seq = sequences.get(
            lora_id,
            [
                (
                    "the subject keeps the face visibility and head position unchanged and "
                    "continues the same natural body motion, shoulders, "
                    "torso, arms and hips move naturally, same initial framing"
                ),
                (
                    "the subject changes posture, shifts weight and keeps "
                    "the face visibility and head position unchanged while the body motion "
                    "continues naturally"
                ),
                (
                    "for the final segment the subject settles into a "
                    "natural body pose with the face remaining at the "
                    "same visibility and head position, same initial framing"
                ),
            ],
        )
        return seq[min(max(chunk_index - 1, 0), len(seq) - 1)]

    @modal.method()
    def generate_video(self, payload: dict) -> str:
        import numpy as np
        import torch
        from diffusers.utils import export_to_video
        from PIL import Image

        torch.cuda.empty_cache()

        init_images = payload.get("init_images") or []
        if not init_images:
            raise ValueError(
                "Se requiere una imagen base en el Paso 1 para el video."
            )

        orig_img = self._decode_payload_image(init_images[0])

        if orig_img.width >= orig_img.height:
            target_w, target_h = 832, 480
        else:
            target_w, target_h = 480, 832

        img = orig_img.resize((target_w, target_h), Image.LANCZOS)

        prompt = payload.get("prompt", "")
        negative_prompt = payload.get(
            "negative_prompt",
            (
                "Bright tones, overexposed, static, blurred details, "
                "worst quality, low quality, deformed, distorted, watermark, "
                "camera zoom, camera pan, moving background"
            ),
        )

        face_ref_img = None
        face_ref_raw = (
            payload.get("face_image")
            or payload.get("face_reference")
            or payload.get("face_ref")
        )
        if not face_ref_raw and len(init_images) > 1:
            face_ref_raw = init_images[1]
        if face_ref_raw:
            try:
                face_ref_img = self._decode_payload_image(face_ref_raw)
            except Exception as e:
                print(f"Face reference decode warn: {e}")

        force_body_only = bool(
            payload.get("body_only") or payload.get("bodyOnly")
        )
        face_state = self._detect_face_state(img)
        face_status = face_state.get("status", "absent")
        face_box = face_state.get("face_box")
        face_mode = "complete"
        if force_body_only or face_status != "complete":
            patched = False
            can_patch_face = (
                face_ref_img is not None
                and face_box
                and face_state.get("has_person")
            )
            if can_patch_face:
                img, patched = self._patch_reference_face(
                    img, face_ref_img, face_box
                )
            if patched:
                face_mode = "face_reference"
                prompt = self._sanitize_face_reference_prompt(prompt)
                prompt = (
                    prompt
                    + ", preserve the reference face identity, same facial "
                    + "features, no invented face"
                )
                negative_prompt += (
                    ", different face, invented face, face morph, "
                    "changed facial features"
                )
            else:
                face_mode = "body_only"
                prompt = self._sanitize_body_only_prompt(prompt)
                prompt = (
                    prompt
                    + ", keep the exact initial camera framing and head "
                    + "position, animate only torso, body, arms and legs, "
                    + "do not add new facial features or change the visible face region"
                )
                negative_prompt += (
                    ", invented face, new facial identity, changed facial "
                    "features, face morph, added eyes, added nose, added mouth"
                )
        print(
            "Video face mode:",
            f"status={face_status} mode={face_mode} box={face_box}",
        )

        chosen_lora = self._select_lora_for_request(payload)
        lora_scale = max(
            0.0, min(1.0, float(payload.get("lora_scale") or 0.85))
        )

        if self.current_loaded_lora != chosen_lora:
            try:
                self.pipe.unload_lora_weights()
            except Exception:
                pass
            self.current_loaded_lora = None
            lpath = (
                self._ensure_lora_path(chosen_lora)
                if chosen_lora
                else None
            )
            if lpath and os.path.exists(lpath):
                try:
                    self.pipe.load_lora_weights(
                        lpath, adapter_name=chosen_lora
                    )
                    self.pipe.set_adapters(
                        [chosen_lora], adapter_weights=[lora_scale]
                    )
                    self.current_loaded_lora = chosen_lora
                except Exception as e:
                    print(f"Civitai LoRA warn: {e}")
                    self.current_loaded_lora = None

        if chosen_lora and self.current_loaded_lora == chosen_lora:
            try:
                self.pipe.set_adapters(
                    [chosen_lora], adapter_weights=[lora_scale]
                )
            except Exception as e:
                print(f"LoRA scale warn: {e}")

        req_seconds = int(payload.get("video_duration_seconds", 5))
        req_seconds = 20 if req_seconds >= 20 else 10 if req_seconds >= 10 else 5
        chunks_needed = {5: 1, 10: 2, 20: 4}[req_seconds]
        video_steps = max(4, min(10, int(payload.get("steps") or 6)))
        video_cfg = max(
            1.0, min(4.0, float(payload.get("cfg_scale") or 1.0))
        )
        seed = int(payload.get("seed") or 123456)
        generator = torch.Generator(device="cuda").manual_seed(seed)

        all_frames = []
        condition_img = img
        with torch.inference_mode():
            for chunk_idx in range(chunks_needed):
                if chunk_idx == 0:
                    chunk_prompt = prompt
                else:
                    if face_mode == "body_only":
                        chunk_prompt = self._body_only_continuation_prompt(
                            chosen_lora, chunk_idx
                        )
                    else:
                        chunk_prompt = self._continuation_prompt(
                            chosen_lora, chunk_idx, chunks_needed
                        )
                        if face_mode == "face_reference":
                            chunk_prompt = self._sanitize_face_reference_prompt(
                                chunk_prompt
                            )
                            chunk_prompt += (
                                ", preserve the same reference face identity"
                            )
                chunk_lora_scale = 0.0
                if self.current_loaded_lora == chosen_lora:
                    transition_loras = {"str1p", "tittydrop", "clothes_on_off"}
                    if face_mode == "body_only":
                        chunk_lora_scale = min(lora_scale, 0.25)
                    else:
                        chunk_lora_scale = (
                            lora_scale
                            if chunk_idx == 0
                            else (
                                0.35
                                if chosen_lora in transition_loras
                                else min(lora_scale, 0.65)
                            )
                        )
                    try:
                        self.pipe.set_adapters(
                            [chosen_lora],
                            adapter_weights=[chunk_lora_scale],
                        )
                    except Exception as e:
                        print(f"LoRA chunk scale warn: {e}")
                raw_frames = list(
                    self.pipe(
                        image=condition_img,
                        prompt=chunk_prompt,
                        negative_prompt=negative_prompt,
                        height=target_h,
                        width=target_w,
                        num_frames=81,
                        guidance_scale=video_cfg,
                        num_inference_steps=video_steps,
                        generator=generator,
                    ).frames[0]
                )
                chunk_pil = [
                    Image.fromarray(self._to_uint8_rgb(frame))
                    for frame in raw_frames
                ]
                if chunk_idx == 0:
                    all_frames.extend(chunk_pil)
                else:
                    all_frames.extend(chunk_pil[1:])
                condition_img = chunk_pil[-1]
                print(
                    "Wan chunk",
                    chunk_idx + 1,
                    "frames=",
                    len(chunk_pil),
                    "mean=",
                    float(np.mean(self._to_uint8_rgb(raw_frames[0]))),
                    "lora=",
                    chosen_lora,
                    "lora_scale=",
                    chunk_lora_scale,
                )
                torch.cuda.empty_cache()

        if not all_frames:
            raise ValueError("Wan 2.1 no devolvió fotogramas válidos")

        first_mean = float(np.mean(self._to_uint8_rgb(all_frames[0])))
        last_mean = float(np.mean(self._to_uint8_rgb(all_frames[-1])))
        if first_mean < 4.0 or last_mean < 4.0:
            raise ValueError(
                f"Wan generó fotogramas casi negros ({first_mean:.2f}, "
                f"{last_mean:.2f})"
            )

        target_total = req_seconds * 16
        out_frames = all_frames[:target_total]

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name

        export_to_video(out_frames, tmp_path, fps=16)
        with open(tmp_path, "rb") as f:
            video_b64 = base64.b64encode(f.read()).decode("utf-8")
        os.remove(tmp_path)
        torch.cuda.empty_cache()
        return video_b64


# =====================================================================
# ENRUTADOR WEB CON COLA ASÍNCRONA (CERO ERRORES "LOAD FAILED")
# =====================================================================
@app.function(timeout=600)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware

    web = FastAPI(
        title="Estudio IA - SDXL Inpainting + OpenPose + Wan 2.1 Async Queue"
    )
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web.get("/sdapi/v1/sd-models")
    async def list_models():
        return [
            {
                "title": (
                    "Lustify Inpainting 9ch + OpenPose SDXL + Wan 2.1 Video"
                ),
                "model_name": "LustifyInpaint_OpenPose_Wan21",
            }
        ]

    async def billing_status():
        from decimal import Decimal

        try:
            workspace = modal.Workspace.from_context()
            summary = workspace.billing.summary()
            credits_used = Decimal("0")
            for name, amount in (summary.adjustments or {}).items():
                if "credit" in str(name).lower():
                    credits_used += max(Decimal("0"), -amount)

            billed_cost = max(Decimal("0"), summary.billed_cost)
            used_usd = credits_used + billed_cost
            budget_usd = Decimal(str(MODAL_CREDIT_BUDGET_USD))
            min_usd = Decimal(str(MIN_GENERATION_CREDIT_USD))
            remaining_usd = max(Decimal("0"), budget_usd - used_usd)

            return {
                "ok": True,
                "can_generate": remaining_usd >= min_usd,
                "remaining_usd": float(remaining_usd),
                "used_usd": float(used_usd),
                "metered_cost_usd": float(summary.metered_cost),
                "billed_cost_usd": float(summary.billed_cost),
                "credit_budget_usd": float(budget_usd),
                "min_credit_usd": float(min_usd),
                "summary_start": summary.start.isoformat(),
                "summary_end": summary.end.isoformat(),
            }
        except Exception as e:
            return {
                "ok": False,
                "can_generate": False,
                "error": str(e),
                "message": "No se pudo consultar el saldo del workspace.",
            }

    async def require_generation_credit():
        status = await billing_status()
        if status.get("can_generate") is not True:
            detail = status.get("message") or (
                "Créditos insuficientes en Modal para iniciar la generación."
            )
            raise HTTPException(status_code=402, detail=detail)

    @web.get("/sdapi/v1/billing-status")
    async def get_billing_status():
        return await billing_status()

    @web.post("/sdapi/v1/job/submit")
    async def submit_async_job(req: Request):
        try:
            await require_generation_credit()
            payload = await req.json()
            is_vid = bool(
                payload.get("is_video") or payload.get("video_frames")
            )
            if is_vid:
                call = await VideoEngine().generate_video.spawn.aio(payload)
                media_type = "video"
            else:
                call = await ImageEngine().generate.spawn.aio(payload)
                media_type = "image"
            return {
                "call_id": call.object_id,
                "media_type": media_type,
                "status": "processing",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @web.get("/sdapi/v1/job/status/{call_id}")
    async def get_async_job_status(call_id: str, media_type: str = "image"):
        fc = modal.FunctionCall.from_id(call_id)
        try:
            result_b64 = await fc.get.aio(timeout=0)
        except TimeoutError:
            return {"status": "processing"}
        except Exception as e:
            return {"status": "failed", "error": str(e)}

        if media_type == "video":
            return {
                "status": "completed",
                "video": result_b64,
                "media_type": "video/mp4",
            }
        return {
            "status": "completed",
            "images": [result_b64],
            "media_type": "image/png",
        }

    @web.post("/sdapi/v1/txt2img")
    async def txt2img_endpoint(req: Request):
        try:
            await require_generation_credit()
            payload = await req.json()
            b64_png = await ImageEngine().generate.remote.aio(payload)
            return {"images": [b64_png], "media_type": "image/png"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @web.post("/sdapi/v1/img2img")
    async def img2img_endpoint(req: Request):
        try:
            await require_generation_credit()
            payload = await req.json()
            if payload.get("is_video") or payload.get("video_frames"):
                b64_mp4 = await VideoEngine().generate_video.remote.aio(payload)
                return {"video": b64_mp4, "media_type": "video/mp4"}

            b64_png = await ImageEngine().generate.remote.aio(payload)
            return {"images": [b64_png], "media_type": "image/png"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @web.post("/sdapi/v1/img2vid")
    async def img2vid_endpoint(req: Request):
        try:
            await require_generation_credit()
            payload = await req.json()
            b64_mp4 = await VideoEngine().generate_video.remote.aio(payload)
            return {"video": b64_mp4, "media_type": "video/mp4"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return web
