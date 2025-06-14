import requests
from dotenv import load_dotenv
import os

load_dotenv()

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "C:\\Users\\User\\PycharmProjects\\NextVibe\\ai_service\\app\\nextvibe-45702-fe118c928598.json"


def main():
    token = os.getenv("TOKEN")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    project_id = "nextvibe-45702"
    model = "veo-2.0-generate-001"
    url = "https://us-central1-aiplatform.googleapis.com/v1/projects/nextvibe-45702/locations/us-central1/publishers/google/models/veo-3.0-generate-preview:predict"

    # Request payload
    payload = {
        "instances": [
            {
                "prompt": "A serene mountain lake at sunset with gentle ripples on the water",
                "sampleCount": 1,
                "videoDuration": "5s",
                "aspectRatio": "16:9"
            }
        ]
    }

    # Make the API request
    response = requests.post(url, json=payload, headers=headers)
    print(response.json())

main()