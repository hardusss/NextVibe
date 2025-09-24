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

// ModerateImage checks image files using Sightengine API
func ModerateImage(filePath string) FileResult {
	var lastErr error
	rateLimitCount := 0
	for attempt := 0; attempt < 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		file, err := os.Open(filePath)
		if err != nil {
			return FileResult{Filename: filePath, Passed: false, Details: map[string]interface{}{"error": err.Error()}}
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
		// Check for rate limit error
		if errMsg, ok := result["error"].(string); ok && (strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			rateLimitCount++
			if rateLimitCount > 3 {
				return FileResult{Filename: filePath, Passed: true, Details: map[string]interface{}{"auto_passed": true, "reason": "rate limit"}}
			}
			continue
		}
		passed := EvaluateMedia(result)
		return FileResult{Filename: filePath, Passed: passed, Details: result}
	}
	return FileResult{Filename: filePath, Passed: false, Details: map[string]interface{}{"error": "All keys exceeded rate limit", "last_error": lastErr}}
}
