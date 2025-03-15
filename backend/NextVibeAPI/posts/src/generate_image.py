import replicate
from dotenv import load_dotenv
from os import getenv

load_dotenv()
REPLICATE_API_TOKEN = getenv("REPLICATE_API_TOKEN")

def generate(promt: str):
    output = replicate.run(
    "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
        input={
            "width": 1024,
            "height": 1024,
            "prompt": promt,
            "refine": "expert_ensemble_refiner",
            "scheduler": "K_EULER",
            "lora_scale": 0.6,
            "num_outputs": 1,
            "guidance_scale": 7.5,
            "apply_watermark": False,
            "high_noise_frac": 0.8,
            "negative_prompt": "",
            "prompt_strength": 0.8,
            "num_inference_steps": 25
        }
    )
    image_url = output[0] 
    return image_url


    
print(generate("A highly detailed, ultra-realistic portrait of a young man with short brown hair and green eyes, sitting at a sleek modern desk with a high-end laptop open in front of him. The screen emits a soft glow, reflecting subtly on his face. His hands rest on the keyboard as if he's in the middle of work or deep concentration. The lighting is soft and natural, creating a cinematic effect. His skin texture is flawless yet natural, with visible pores and slight imperfections. The background is blurred, resembling a professional studio or a cozy, modern workspace. Photorealistic, hyper-detailed, DSLR quality, cinematic lighting, ultra-sharp, depth of field."))