package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func ModerateVideo(filePath string) FileResult {
	var lastErr error
	rateLimitCount := 0
	for attempt := 0; attempt < 5; attempt++ {
		apiUser, apiSecret := GetRandomSightengineCredentials()
		// Перевіряємо чи файл існує
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			return FileResult{
				Filename: filePath,
				Passed:   false,
				Details:  map[string]interface{}{"error": "File not found"},
			}
		}
		// Отримуємо розширення файлу
		ext := filepath.Ext(filePath)
		if !IsVideo(ext) {
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
			continue
		}
		defer file.Close()
		part, err := writer.CreateFormFile("media", filepath.Base(filePath))
		if err != nil {
			lastErr = err
			continue
		}
		_, err = io.Copy(part, file)
		if err != nil {
			lastErr = err
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
			continue
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()
		responseBody, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			continue
		}
		fmt.Printf("Video API Response Status: %d\n", resp.StatusCode)
		fmt.Printf("Video API Response Body: %s\n", string(responseBody))
		var result map[string]interface{}
		err = json.Unmarshal(responseBody, &result)
		if err != nil {
			lastErr = err
			continue
		}
		if errMsg, ok := result["error"].(string); ok && (strings.Contains(errMsg, "rate limit") || strings.Contains(errMsg, "limit")) {
			lastErr = fmt.Errorf("rate limit: %s", errMsg)
			rateLimitCount++
			if rateLimitCount > 3 {
				return FileResult{Filename: filePath, Passed: true, Details: map[string]interface{}{"auto_passed": true, "reason": "rate limit"}}
			}
			continue
		}
		if status, ok := result["status"].(string); ok && status != "success" {
			lastErr = fmt.Errorf("api status: %s", status)
			continue
		}
		passed := evaluateVideoResult(result)
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

// evaluateVideoResult оцінює результати модерації відео
func evaluateVideoResult(result map[string]interface{}) bool {
	// Для відео API структура може бути іншою
	// Перевіряємо frames array якщо є
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
