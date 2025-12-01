from replicate.client import Client
from dotenv import load_dotenv
from os import getenv
from random import randint

# Load environment variables
load_dotenv()
REPLICATE_API_TOKEN = getenv("REPLICATE_API_TOKEN")

QUALITY_PROMPT = (
    "ultra-detailed, hyper-realistic, 8k, 16k, cinematic lighting, "
    "volumetric lighting, photorealistic textures, intricate details, "
    "highly detailed, masterpiece, award-winning, realistic shadows, "
    "vibrant colors, sharp focus, cinematic composition, dynamic lighting, "
    "soft global illumination, realistic reflections, depth of field, "
    "beautifully lit, epic scene, ultra high resolution, trending on ArtStation"
)


def generate(promt: str) -> str:
    """
    Generates an image based on the given text prompt using the black-forest-labs/flux-schnell model.

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
    client = Client(api_token=REPLICATE_API_TOKEN)
    rand_seed = randint(0, 2147483647)

    full_prompt = f"{promt}, {QUALITY_PROMPT}, seed {rand_seed}"

    output = client.run(
        "black-forest-labs/flux-schnell",
        input={
            "seed": rand_seed,
            "prompt": full_prompt,
            "num_outputs": 1,
        }
    )
    
    # Extract the generated image URL from the output
    image_url = output[0]  
    return str(image_url)
