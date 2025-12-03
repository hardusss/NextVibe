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
	"path/filepath"
	"strings"
)

func ModerateVideo(filePath string) FileResult {
	var lastErr error
	
	for attempt := 1; attempt <= 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		
		// Check if file exists
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			log.Printf("❌ Video file not found: %s", filePath)
			return FileResult{
				Filename: filePath,
				Passed:   false,
				Details:  map[string]interface{}{"error": "File not found"},
			}
		}
		
		// Check file extension
		ext := filepath.Ext(filePath)
		if !IsVideo(ext) {
			log.Printf("❌ Not a supported video format: %s", ext)
			return FileResult{
				Filename: filePath,
				Passed:   false,
				Details:  map[string]interface{}{"error": "Not a supported video format"},
			}
		}
		
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		
		file, err := os.Open(filePath)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Failed to open file: %v", attempt, 5, err)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass(filePath, errType, attempt)
					return CreateAutoPassResult(filePath, errType, reason, nil)
				}
			}
			continue
		}
		defer file.Close()
		
		part, err := writer.CreateFormFile("media", filepath.Base(filePath))
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Failed to create form file: %v", attempt, 5, err)
			continue
		}
		
		_, err = io.Copy(part, file)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Failed to copy file: %v", attempt, 5, err)
			continue
		}
		
		writer.WriteField("models", "nudity,wad,offensive,weapon,alcohol")
		writer.WriteField("api_user", apiUser)
		writer.WriteField("api_secret", apiSecret)
		writer.WriteField("video_frames", "10")
		writer.WriteField("video_frame_interval", "10")
		writer.Close()
		
		req, err := http.NewRequest("POST", "https://api.sightengine.com/1.0/video/check.json", body)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Request creation failed: %v", attempt, 5, err)
			continue
		}
		
		req.Header.Set("Content-Type", writer.FormDataContentType())
		
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Request failed: %v", attempt, 5, err)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass(filePath, errType, attempt)
					return CreateAutoPassResult(filePath, errType, reason, nil)
				}
			}
			continue
		}
		defer resp.Body.Close()
		
		responseBody, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: Failed to read response: %v", attempt, 5, err)
			continue
		}
		
		log.Printf("   Video API Response Status: %d", resp.StatusCode)
		
		var result map[string]interface{}
		err = json.Unmarshal(responseBody, &result)
		if err != nil {
			lastErr = err
			log.Printf("   Video attempt %d/%d: JSON parse failed: %v", attempt, 5, err)
			continue
		}
		
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
			log.Printf("   Video attempt %d/%d: Rate limit", attempt, 5)
			
			if attempt == 5 {
				LogAutoPass(filePath, ErrorRateLimit, attempt)
				return CreateAutoPassResult(filePath, ErrorRateLimit, 
					"All API keys exceeded rate limit", result)
			}
			continue
		}
		
		// Check status
		if status, ok := result["status"].(string); ok && status != "success" {
			lastErr = fmt.Errorf("api status: %s", status)
			log.Printf("   Video attempt %d/%d: API status: %s", attempt, 5, status)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(lastErr, result, resp.StatusCode); shouldPass {
					LogAutoPass(filePath, errType, attempt)
					return CreateAutoPassResult(filePath, errType, reason, result)
				}
			}
			continue
		}
		
		// Success - evaluate
		passed := evaluateVideoResult(result)
		log.Printf("   ✅ Video moderation successful on attempt %d", attempt)
		return FileResult{
			Filename: filePath,
			Passed:   passed,
			Details:  result,
		}
	}
	
	// All failed
	log.Printf("❌ All video moderation attempts failed for: %s", filePath)
	LogAutoPass(filePath, ErrorUnknown, 5)
	return CreateAutoPassResult(filePath, ErrorUnknown, 
		"All retry attempts failed - allowing content", 
		map[string]interface{}{"last_error": fmt.Sprint(lastErr)})
}

func evaluateVideoResult(result map[string]interface{}) bool {
	if frames, ok := result["frames"].([]interface{}); ok {
		for _, frame := range frames {
			if frameMap, ok := frame.(map[string]interface{}); ok {
				if !EvaluateMedia(frameMap) {
					return false
				}
			}
		}
		return true
	}
	return EvaluateMedia(result)
}