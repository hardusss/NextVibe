package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
)

func ModerateImage(filePath string) FileResult {
	if strings.HasPrefix(filePath, "http://") || strings.HasPrefix(filePath, "https://") {
		return ModerateImageByURL(filePath)
	}
	return ModerateImageByFile(filePath)
}

func ModerateImageByURL(imageURL string) FileResult {
	var lastErr error
	rateLimitCount := 0

	for attempt := 0; attempt < 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()


		reqURL := fmt.Sprintf(
			"https://api.sightengine.com/1.0/check.json?url=%s&models=nudity,wad,offensive,weapon,alcohol&api_user=%s&api_secret=%s",
			imageURL, apiUser, apiSecret,
		)

		resp, err := http.Get(reqURL)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		buf := new(bytes.Buffer)
		_, _ = io.Copy(buf, resp.Body)

		var result map[string]interface{}
		_ = json.Unmarshal(buf.Bytes(), &result)

		if errMsg, ok := result["error"].(string); ok && 
			(strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			rateLimitCount++
			if rateLimitCount > 3 {
				fmt.Println("⚠️ Rate limit exceeded 3 times, auto-passing")
				return FileResult{
					Filename: imageURL,
					Passed:   true,
					Details:  map[string]interface{}{"auto_passed": true, "reason": "rate limit"},
				}
			}
			continue
		}

		passed := EvaluateMedia(result)

		if nudity, ok := result["nudity"].(map[string]interface{}); ok {
			if raw, ok := nudity["raw"].(float64); ok {
				result["moderation_summary"] = map[string]interface{}{
					"nudity_raw": raw,
					"passed":     passed,
					"reason":     fmt.Sprintf("Nudity raw score: %.2f (threshold: 0.6)", raw),
				}
			}
		}
		
		return FileResult{
			Filename: imageURL,
			Passed:   passed,
			Details:  result,
		}
	}

	fmt.Println("❌ All retry attempts failed")
	return FileResult{
		Filename: imageURL,
		Passed:   false,
		Details:  map[string]interface{}{"error": "All keys exceeded rate limit", "last_error": fmt.Sprint(lastErr)},
	}
}

func ModerateImageByFile(filePath string) FileResult {
	var lastErr error
	rateLimitCount := 0

	for attempt := 0; attempt < 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()

		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		file, err := os.Open(filePath)
		if err != nil {
			return FileResult{
				Filename: filePath,
				Passed:   false,
				Details:  map[string]interface{}{"error": err.Error()},
			}
		}
		defer file.Close()

		part, _ := writer.CreateFormFile("media", filePath)
		_, _ = io.Copy(part, file)
		writer.WriteField("models", "nudity,wad,offensive,weapon,alcohol")
		writer.WriteField("api_user", apiUser)
		writer.WriteField("api_secret", apiSecret)
		writer.Close()

		req, _ := http.NewRequest("POST", "https://api.sightengine.com/1.0/check.json", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		buf := new(bytes.Buffer)
		_, _ = io.Copy(buf, resp.Body)

		var result map[string]interface{}
		_ = json.Unmarshal(buf.Bytes(), &result)

		// Rate limit check
		if errMsg, ok := result["error"].(string); ok && 
			(strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			rateLimitCount++
			if rateLimitCount > 3 {
				return FileResult{
					Filename: filePath,
					Passed:   true,
					Details:  map[string]interface{}{"auto_passed": true, "reason": "rate limit"},
				}
			}
			continue
		}

		passed := EvaluateMedia(result)
		return FileResult{
			Filename: filePath,
			Passed:   passed,
			Details:  result,
		}
	}

	return FileResult{
		Filename: filePath,
		Passed:   false,
		Details:  map[string]interface{}{"error": "All keys exceeded rate limit", "last_error": lastErr},
	}
}


