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

// Request Structures
type InputItem struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type RequestData struct {
	Model string      `json:"model"`
	Input []InputItem `json:"input"`
}

// Response Structures
type ModerationTextResult struct {
	Flagged    bool            `json:"flagged"`
	Categories map[string]bool `json:"categories"` // Using map to easily iterate keys
}

type OpenAIResponse struct {
	Results []ModerationTextResult `json:"results"`
}

// ModerateText returns:
// isBanned (bool): true if content is harmful
// reason (string): the category name (e.g., "violence") or empty if safe
func OpenAiModerateText(text string) (bool, string) {
	url := "https://api.openai.com/v1/moderations"
	
	// Use environment variable for safety
	apiKey := os.Getenv("OPENAI_API_KEY") 
	if apiKey == "" {
		fmt.Println("Error: OPENAI_API_KEY is not set")
		return true, "api_key_missing" // Fail-safe: block if no key
	}

	// Prepare Request Data
	data := RequestData{
		Model: "omni-moderation-latest",
		Input: []InputItem{
			{
				Type: "text",
				Text: text,
			},
		},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		fmt.Println("JSON Error:", err)
		return true, "internal_error"
	}

	// Create Request
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

	// Execute Request
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Network Error:", err)
		return true, "network_error"
	}
	defer resp.Body.Close()

	// Read and Parse Body
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

	// Check Results
	if len(apiResp.Results) > 0 {
		result := apiResp.Results[0]
		
		if result.Flagged {
			// Find the specific reason(s)
			var reasons []string
			for category, isTrue := range result.Categories {
				if isTrue {
					reasons = append(reasons, category)
				}
			}
			// Return true and the joined reasons (e.g., "violence, hate")
			return true, strings.Join(reasons, ", ")
		}
	}

	// Content is safe
	return false, ""
}