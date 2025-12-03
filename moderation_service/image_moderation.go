package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
	
	for attempt := 1; attempt <= 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		reqURL := fmt.Sprintf(
			"https://api.sightengine.com/1.0/check.json?url=%s&models=nudity,wad,offensive,weapon,alcohol&api_user=%s&api_secret=%s",
			imageURL, apiUser, apiSecret,
		)
		
		resp, err := http.Get(reqURL)
		if err != nil {
			lastErr = err
			log.Printf("   Attempt %d/%d failed with network error: %v", attempt, 5, err)
			
			// Check if should auto-pass on last attempt
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass(imageURL, errType, attempt)
					return CreateAutoPassResult(imageURL, errType, reason, nil)
				}
			}
			continue
		}
		defer resp.Body.Close()
		
		buf := new(bytes.Buffer)
		_, _ = io.Copy(buf, resp.Body)
		
		var result map[string]interface{}
		_ = json.Unmarshal(buf.Bytes(), &result)
		
		// Check if we should auto-pass due to API errors
		if shouldPass, errType, reason := ShouldAutoPass(lastErr, result, resp.StatusCode); shouldPass {
			LogAutoPass(imageURL, errType, attempt)
			return CreateAutoPassResult(imageURL, errType, reason, result)
		}
		
		// Check for rate limit in response
		if errMsg, ok := result["error"].(string); ok && 
			(strings.Contains(strings.ToLower(errMsg), "rate limit") || 
			 strings.Contains(strings.ToLower(errMsg), "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			log.Printf("   Attempt %d/%d: Rate limit detected", attempt, 5)
			
			// Auto-pass on last attempt
			if attempt == 5 {
				LogAutoPass(imageURL, ErrorRateLimit, attempt)
				return CreateAutoPassResult(imageURL, ErrorRateLimit, 
					"All API keys exceeded rate limit - allowing content", result)
			}
			continue
		}
		
		// Success - evaluate normally
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
		
		log.Printf("   ✅ Moderation successful on attempt %d", attempt)
		return FileResult{
			Filename: imageURL,
			Passed:   passed,
			Details:  result,
		}
	}
	
	// All attempts failed - auto-pass
	log.Printf("❌ All %d attempts failed for %s", 5, imageURL)
	LogAutoPass(imageURL, ErrorUnknown, 5)
	return CreateAutoPassResult(imageURL, ErrorUnknown, 
		"All retry attempts failed - allowing content by default", 
		map[string]interface{}{"last_error": fmt.Sprint(lastErr)})
}

func ModerateImageByFile(filePath string) FileResult {
	var lastErr error
	
	for attempt := 1; attempt <= 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		
		file, err := os.Open(filePath)
		if err != nil {
			log.Printf("❌ Failed to open file: %v", err)
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
			log.Printf("   Attempt %d/%d failed with error: %v", attempt, 5, err)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass(filePath, errType, attempt)
					return CreateAutoPassResult(filePath, errType, reason, nil)
				}
			}
			continue
		}
		defer resp.Body.Close()
		
		buf := new(bytes.Buffer)
		_, _ = io.Copy(buf, resp.Body)
		
		var result map[string]interface{}
		_ = json.Unmarshal(buf.Bytes(), &result)
		
		// Check for API errors
		if shouldPass, errType, reason := ShouldAutoPass(lastErr, result, resp.StatusCode); shouldPass {
			LogAutoPass(filePath, errType, attempt)
			return CreateAutoPassResult(filePath, errType, reason, result)
		}
		
		// Check rate limit
		if errMsg, ok := result["error"].(string); ok && 
			(strings.Contains(strings.ToLower(errMsg), "rate limit") || 
			 strings.Contains(strings.ToLower(errMsg), "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			log.Printf("   Attempt %d/%d: Rate limit", attempt, 5)
			
			if attempt == 5 {
				LogAutoPass(filePath, ErrorRateLimit, attempt)
				return CreateAutoPassResult(filePath, ErrorRateLimit, 
					"All API keys exceeded rate limit", result)
			}
			continue
		}
		
		// Success
		passed := EvaluateMedia(result)
		log.Printf("   ✅ File moderation successful on attempt %d", attempt)
		return FileResult{
			Filename: filePath,
			Passed:   passed,
			Details:  result,
		}
	}
	
	// All failed
	log.Printf("❌ All attempts failed for file: %s", filePath)
	LogAutoPass(filePath, ErrorUnknown, 5)
	return CreateAutoPassResult(filePath, ErrorUnknown, 
		"All retry attempts failed - allowing content", 
		map[string]interface{}{"last_error": fmt.Sprint(lastErr)})
}