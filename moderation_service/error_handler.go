package main

import (
	"fmt"
	"log"
	"strings"
)

// ErrorType represents different types of moderation errors
type ErrorType string

const (
	ErrorCredentials  ErrorType = "credentials_error"
	ErrorRateLimit    ErrorType = "rate_limit_exceeded"
	ErrorServer       ErrorType = "server_error"
	ErrorNetwork      ErrorType = "network_error"
	ErrorUnknown      ErrorType = "unknown_error"
)

// ShouldAutoPass determines if we should auto-pass content due to technical errors
func ShouldAutoPass(err error, result map[string]interface{}, statusCode int) (bool, ErrorType, string) {
	// Check HTTP status codes
	if statusCode == 429 {
		log.Printf("⚠️ Rate limit exceeded (HTTP 429) - auto-passing content")
		return true, ErrorRateLimit, "Rate limit exceeded - allowing content by default"
	}
	
	if statusCode == 401 || statusCode == 403 {
		log.Printf("⚠️ Authentication failed (HTTP %d) - auto-passing content", statusCode)
		return true, ErrorCredentials, "Authentication failed - allowing content by default"
	}
	
	if statusCode >= 500 {
		log.Printf("⚠️ Server error (HTTP %d) - auto-passing content", statusCode)
		return true, ErrorServer, "Sightengine server error - allowing content by default"
	}

	// Check API response for errors
	if result != nil {
		// Check for error field in response
		if errData, ok := result["error"].(map[string]interface{}); ok {
			errType, _ := errData["type"].(string)
			errMsg, _ := errData["message"].(string)
			
			// Credentials error
			if errType == "credentials_error" || strings.Contains(errMsg, "Incorrect API") {
				log.Printf("⚠️ Credentials error detected - auto-passing content")
				return true, ErrorCredentials, "Invalid API credentials - allowing content by default"
			}
			
			// Rate limit in error message
			if strings.Contains(strings.ToLower(errMsg), "rate limit") || 
			   strings.Contains(strings.ToLower(errMsg), "too many requests") {
				log.Printf("⚠️ Rate limit in error message - auto-passing content")
				return true, ErrorRateLimit, "Rate limit exceeded - allowing content by default"
			}
		}
		
		// Check status field
		if status, ok := result["status"].(string); ok && status == "failure" {
			log.Printf("⚠️ API returned failure status - auto-passing content")
			return true, ErrorUnknown, "API failure - allowing content by default"
		}
	}
	
	// Check network errors
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "timeout") || 
		   strings.Contains(errMsg, "connection refused") ||
		   strings.Contains(errMsg, "no such host") {
			log.Printf("⚠️ Network error detected - auto-passing content: %v", err)
			return true, ErrorNetwork, fmt.Sprintf("Network error - allowing content by default: %v", err)
		}
	}
	
	return false, "", ""
}

// CreateAutoPassResult creates a FileResult that auto-passes content
func CreateAutoPassResult(filename string, errorType ErrorType, reason string, originalDetails map[string]interface{}) FileResult {
	details := map[string]interface{}{
		"auto_passed": true,
		"error_type":  string(errorType),
		"reason":      reason,
		"status":      "technical_error",
	}
	
	// Preserve some original details if available
	if originalDetails != nil {
		if reqID, ok := originalDetails["request"]; ok {
			details["original_request"] = reqID
		}
	}
	
	return FileResult{
		Filename: filename,
		Passed:   true,
		Category: "technical_error",
		Errors: []ModerationError{
			{
				Type:    string(errorType),
				Message: reason,
			},
		},
		Details: details,
	}
}

// LogAutoPass logs when content is auto-passed
func LogAutoPass(filename string, errorType ErrorType, attempt int) {
	log.Printf("🔓 AUTO-PASS: %s | Type: %s | Attempt: %d", filename, errorType, attempt)
}