from replicate.client import Client
from dotenv import load_dotenv
from os import getenv

# Load environment variables
load_dotenv()
REPLICATE_API_TOKEN = getenv("REPLICATE_API_TOKEN")

def generate(promt: str) -> str:
    """
    Generates an image based on the given text prompt using the Bytedance AI SDXL model.

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
    output = client.run(
        "bytedance/sdxl-lightning-4step:6f7a773af6fc3e8de9d5a3c00be77c17308914bf67772726aff83496ba1e3bbe",
        input={
            "width": 1024,
            "height": 1024,
            "prompt": promt,
            "scheduler": "K_EULER",
            "num_outputs": 1,
            "guidance_scale": 0,
            "negative_prompt": "worst quality, low quality",
            "num_inference_steps": 4
        }
    )
    
    # Extract the generated image URL from the output
    image_url = output[0]  
    return str(image_url)