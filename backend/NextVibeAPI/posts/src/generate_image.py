"""
Module for generating images using the Replicate API.

This module provides a function to generate an image from a given text prompt using 
the Stability AI SDXL model via the Replicate API.

Environment Variables:
    REPLICATE_API_TOKEN (str): API token required for authentication with the Replicate API.

Dependencies:
    - replicate
    - dotenv (to load environment variables)
    - os (to access environment variables)
"""

import replicate
from dotenv import load_dotenv
from os import getenv

# Load environment variables
load_dotenv()
REPLICATE_API_TOKEN = getenv("REPLICATE_API_TOKEN")

def generate(promt: str) -> str:
    """
    Generates an image based on the given text prompt using the Stability AI SDXL model.

    Parameters:
        promt (str): The text prompt describing the desired image.

    Returns:
        str: The URL of the generated image.

    Raises:
        Exception: If the API request fails or an invalid response is returned.

    Example Usage:
        image_url = generate("A futuristic cityscape at night, ultra-realistic")
        print(image_url)  # Outputs the URL of the generated image
    """
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
            "num_inference_steps": 100
        }
    )
    
    # Extract the generated image URL from the output
    image_url = output[0]  
    return str(image_url)
