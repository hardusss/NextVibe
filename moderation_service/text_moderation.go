package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

func ModerateText(text string) FileResult {
	if text == "" {
		return FileResult{
			Filename: "text",
			Passed:   true,
			Errors:   nil,
			Details: map[string]interface{}{
				"categories": []string{"universal"},
				"link": map[string]interface{}{
					"matches": []interface{}{},
				},
				"personal": map[string]interface{}{
					"matches": []interface{}{},
				},
				"profanity": map[string]interface{}{
					"matches": []interface{}{},
				},
				"request": map[string]interface{}{
					"id":         fmt.Sprintf("req_%s", GenerateRandomString(20)),
					"timestamp":  float64(time.Now().Unix()),
					"operations": 1,
				},
				"status": "success",
			},
		}
	}

	var lastErr error
	
	for attempt := 1; attempt <= 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		
		var b bytes.Buffer
		w := multipart.NewWriter(&b)
		w.WriteField("text", text)
		w.WriteField("models", "nudity,wad,offensive,profanity")
		w.WriteField("mode", "rules")
		w.WriteField("lang", "en")
		w.WriteField("api_user", apiUser)
		w.WriteField("api_secret", apiSecret)
		w.Close()

		req, err := http.NewRequest("POST", "https://api.sightengine.com/1.0/text/check.json", &b)
		if err != nil {
			lastErr = err
			log.Printf("   Text attempt %d/%d: Request creation failed: %v", attempt, 5, err)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass("text", errType, attempt)
					return CreateAutoPassResult("text", errType, reason, nil)
				}
			}
			continue
		}

		req.Header.Set("Content-Type", w.FormDataContentType())
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			log.Printf("   Text attempt %d/%d: Request failed: %v", attempt, 5, err)
			
			if attempt == 5 {
				if shouldPass, errType, reason := ShouldAutoPass(err, nil, 0); shouldPass {
					LogAutoPass("text", errType, attempt)
					return CreateAutoPassResult("text", errType, reason, nil)
				}
			}
			continue
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			log.Printf("   Text attempt %d/%d: Failed to read response: %v", attempt, 5, err)
			continue
		}

		log.Printf("   Text moderation response status: %d", resp.StatusCode)

		var result map[string]interface{}
		err = json.Unmarshal(body, &result)
		if err != nil {
			lastErr = err
			log.Printf("   Text attempt %d/%d: JSON parse failed: %v", attempt, 5, err)
			continue
		}

		// Check for API errors
		if shouldPass, errType, reason := ShouldAutoPass(lastErr, result, resp.StatusCode); shouldPass {
			LogAutoPass("text", errType, attempt)
			return CreateAutoPassResult("text", errType, reason, result)
		}

		// Check rate limit
		if errMsg, ok := result["error"].(string); ok && 
			(strings.Contains(strings.ToLower(errMsg), "rate limit") || 
			 strings.Contains(strings.ToLower(errMsg), "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			log.Printf("   Text attempt %d/%d: Rate limit", attempt, 5)
			
			if attempt == 5 {
				LogAutoPass("text", ErrorRateLimit, attempt)
				return CreateAutoPassResult("text", ErrorRateLimit, 
					"All API keys exceeded rate limit", result)
			}
			continue
		}

		// Success - evaluate
		modResult := EvaluateTextFlexible(result, ModerationModerate)
		passed := modResult.Passed

		var errors []ModerationError

		// Check for nudity
		if nudity, ok := result["nudity"].(map[string]interface{}); ok {
			if safe, ok := nudity["safe"].(float64); ok && safe < 0.7 {
				errors = append(errors, ModerationError{
					Type:       "nudity",
					Message:    "Content contains inappropriate references",
					Confidence: 1 - safe,
				})
			}
		}

		// Check for weapon, alcohol, drugs
		if wad, ok := result["weapon_alcohol_drugs"].(map[string]interface{}); ok {
			if safe, ok := wad["safe"].(float64); ok && safe < 0.7 {
				errors = append(errors, ModerationError{
					Type:       "prohibited_content",
					Message:    "Content contains references to weapons, alcohol, or drugs",
					Confidence: 1 - safe,
				})
			}
		}

		// Check for offensive content
		if offensive, ok := result["offensive"].(map[string]interface{}); ok {
			if safe, ok := offensive["safe"].(float64); ok && safe < 0.7 {
				errors = append(errors, ModerationError{
					Type:       "offensive",
					Message:    "Content contains offensive material",
					Confidence: 1 - safe,
				})
			}
		}

		// Check for profanity
		if profanity, ok := result["profanity"].(map[string]interface{}); ok {
			if safe, ok := profanity["safe"].(float64); ok && safe < 0.7 {
				errors = append(errors, ModerationError{
					Type:       "profanity",
					Message:    "Content contains profanity",
					Confidence: 1 - safe,
				})
			}
		}

		categories := DetectCategories(text)
		result["categories"] = categories

		log.Printf("   ✅ Text moderation successful on attempt %d", attempt)
		return FileResult{
			Filename: "text",
			Passed:   passed,
			Errors:   errors,
			Details:  result,
		}
	}

	// All failed
	log.Printf("❌ All text moderation attempts failed")
	LogAutoPass("text", ErrorUnknown, 5)
	return CreateAutoPassResult("text", ErrorUnknown, 
		"All retry attempts failed - allowing content", 
		map[string]interface{}{"last_error": fmt.Sprint(lastErr)})
}