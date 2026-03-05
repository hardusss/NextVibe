package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type ImageURL struct {
	URL string `json:"url"`
}

type InputImageItem struct {
	Type     string   `json:"type"`
	ImageURL ImageURL `json:"image_url,omitempty"`
	Text     string   `json:"text,omitempty"`
}

type RequestImageData struct {
	Model string           `json:"model"`
	Input []InputImageItem `json:"input"`
}

// ModerateImage returns:
// isBanned (bool): true if content is harmful
// reason (string): the category name (e.g., "violence") or empty if safe
func OpenAiModerateImage(imageURL string) (bool, string) {

	url := "https://api.openai.com/v1/moderations"
	apiKey := os.Getenv("OPENAI_API_KEY")

	data := RequestImageData{
		Model: "omni-moderation-latest",
		Input: []InputImageItem{
			{
				Type: "image_url",
				ImageURL: ImageURL{
					URL: imageURL,
				},
			},
		},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("JSON Error:", err)
		return true, "internal_error"
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Request Creation Error:", err)
		return true, "internal_error"
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Network Error:", err)
		return true, "network_error"
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		fmt.Printf("API Error %s: %s\n", resp.Status, string(body))
		return true, "api_error"
	}

	var apiResp OpenAIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		fmt.Println("Response Parsing Error:", err)
		return true, "parsing_error"
	}

	if len(apiResp.Results) > 0 {
		result := apiResp.Results[0]

		if result.Flagged {
			var reasons []string

			for category, isTrue := range result.Categories {
				if isTrue {
					reasons = append(reasons, category)
				}
			}

			return true, strings.Join(reasons, ", ")
		}
	}

	return false, ""
}
