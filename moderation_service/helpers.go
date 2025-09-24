package main

import (
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
)

// Internal helpers for package-level use
func isImage(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif"
}

func isVideo(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".mp4" || ext == ".mov" || ext == ".avi" || ext == ".mkv"
}

// getRandomSightengineCredentials returns a random (user, secret) pair from the available SIGHTENGINE_USER/SECRET envs
func getRandomSightengineCredentials() (string, string) {
	var users []string
	var secrets []string
	for i := 1; i <= 10; i++ {
		var userKey, secretKey string
		if i == 1 {
			userKey = "SIGHTENGINE_USER"
			secretKey = "SIGHTENGINE_SECRET"
		} else {
			userKey = "SIGHTENGINE_USER" + fmt.Sprint(i)
			secretKey = "SIGHTENGINE_SECRET" + fmt.Sprint(i)
		}
		user := os.Getenv(userKey)
		secret := os.Getenv(secretKey)
		if user != "" && secret != "" {
			users = append(users, user)
			secrets = append(secrets, secret)
		}
	}
	if len(users) == 0 {
		return "", ""
	}
	idx := rand.Intn(len(users))
	return users[idx], secrets[idx]
}

const (
	ModerationStrict = iota
	ModerationModerate
	ModerationLenient
)

type ModerationResult struct {
	Passed            bool     `json:"passed"`
	Action            string   `json:"action"`
	Reasons           []string `json:"reasons"`
	SeverityScore     int      `json:"severity_score"`
	RecommendedAction string   `json:"recommended_action"`
}

// Exported helpers for use in other files
func IsImage(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif"
}

func IsVideo(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".mp4" || ext == ".mov" || ext == ".avi" || ext == ".mkv"
}

func EvaluateMedia(details map[string]interface{}) bool {
	if nudity, ok := details["nudity"].(map[string]interface{}); ok {
		if raw, ok := nudity["raw"].(float64); ok && raw > 0.5 {
			return false
		}
	}
	if porn, ok := details["porn"].(map[string]interface{}); ok {
		if raw, ok := porn["raw"].(float64); ok && raw > 0.5 {
			return false
		}
	}
	if wad, ok := details["weapon_firearm"].(float64); ok && wad > 0.1 {
		return false
	}
	if drugs, ok := details["drugs"].(float64); ok && drugs > 0.1 {
		return false
	}
	if offensive, ok := details["offensive"].(map[string]interface{}); ok {
		if prob, ok := offensive["prob"].(float64); ok && prob > 0.2 {
			return false
		}
	}
	return true
}

// getRandomSightengineCredentials returns a random (user, secret) pair from the available SIGHTENGINE_USER/SECRET envs
func GetRandomSightengineCredentials() (string, string) {
	var users []string
	var secrets []string
	for i := 1; i <= 10; i++ {
		var userKey, secretKey string
		if i == 1 {
			userKey = "SIGHTENGINE_USER"
			secretKey = "SIGHTENGINE_SECRET"
		} else {
			userKey = "SIGHTENGINE_USER" + fmt.Sprint(i)
			secretKey = "SIGHTENGINE_SECRET" + fmt.Sprint(i)
		}
		user := os.Getenv(userKey)
		secret := os.Getenv(secretKey)
		if user != "" && secret != "" {
			users = append(users, user)
			secrets = append(secrets, secret)
		}
	}
	if len(users) == 0 {
		return "", ""
	}
	idx := rand.Intn(len(users))
	user := users[idx]
	secret := secrets[idx]
	log.Printf("Using SIGHTENGINE_USER=%s, SIGHTENGINE_SECRET=%s", user, secret)
	return user, secret
}

func EvaluateTextFlexible(result map[string]interface{}, level int) ModerationResult {
	modResult := ModerationResult{
		Passed:        true,
		Action:        "allow",
		Reasons:       []string{},
		SeverityScore: 0,
	}

	if status, ok := result["status"].(string); ok && status != "success" {
		modResult.Passed = false
		modResult.Action = "block"
		modResult.Reasons = append(modResult.Reasons, "API error")
		return modResult
	}

	if profanity, ok := result["profanity"].(map[string]interface{}); ok {
		if matches, ok := profanity["matches"].([]interface{}); ok {
			for _, match := range matches {
				if matchMap, ok := match.(map[string]interface{}); ok {
					intensity := matchMap["intensity"].(string)
					matchType := matchMap["type"].(string)
					matchText := matchMap["match"].(string)

					severityPoints := CalculateSeverityPoints(matchType, intensity)
					modResult.SeverityScore += severityPoints

					switch level {
					case ModerationStrict:
						if intensity == "high" || intensity == "medium" {
							modResult.Passed = false
							modResult.Action = "block"
							modResult.Reasons = append(modResult.Reasons,
								fmt.Sprintf("Blocked: %s (%s, %s)", matchText, matchType, intensity))
						} else if intensity == "low" {
							modResult.Action = "warn"
							modResult.Reasons = append(modResult.Reasons,
								fmt.Sprintf("Warning: %s (%s)", matchText, matchType))
						}

					case ModerationModerate:
						if intensity == "high" && (matchType == "discriminatory" || matchType == "hate") {
							modResult.Passed = false
							modResult.Action = "block"
							modResult.Reasons = append(modResult.Reasons,
								fmt.Sprintf("Blocked: discriminatory content - %s", matchText))
						} else if intensity == "high" {
							modResult.Action = "warn"
							modResult.Reasons = append(modResult.Reasons,
								fmt.Sprintf("Warning: inappropriate language - %s", matchText))
						}

					case ModerationLenient:
						if intensity == "high" && matchType == "discriminatory" {
							modResult.Passed = false
							modResult.Action = "block"
							modResult.Reasons = append(modResult.Reasons,
								fmt.Sprintf("Blocked: discriminatory language - %s", matchText))
						} else {
							if intensity == "high" {
								modResult.Action = "warn"
								modResult.Reasons = append(modResult.Reasons,
									fmt.Sprintf("Content may be inappropriate: %s", matchText))
							}
						}
					}
				}
			}
		}
	}

	if personal, ok := result["personal"].(map[string]interface{}); ok {
		if matches, ok := personal["matches"].([]interface{}); ok && len(matches) > 0 {
			modResult.Passed = false
			modResult.Action = "block"
			modResult.Reasons = append(modResult.Reasons, "Personal information detected")
			modResult.SeverityScore += 50
		}
	}

	if link, ok := result["link"].(map[string]interface{}); ok {
		if matches, ok := link["matches"].([]interface{}); ok && len(matches) > 0 {
			if level == ModerationStrict {
				modResult.Passed = false
				modResult.Action = "block"
			} else {
				modResult.Action = "review"
			}
			modResult.Reasons = append(modResult.Reasons, "Suspicious links detected")
			modResult.SeverityScore += 30
		}
	}

	modResult.RecommendedAction = GetRecommendedAction(modResult.SeverityScore, level)

	log.Printf("Text moderation: passed=%t, action=%s, severity=%d",
		modResult.Passed, modResult.Action, modResult.SeverityScore)

	return modResult
}

func EvaluateText(result map[string]interface{}) bool {
	if status, ok := result["status"].(string); ok && status != "success" {
		log.Printf("Moderation failed with status: %s", status)
		return false
	}
	blocked := false

	if profanity, ok := result["profanity"].(map[string]interface{}); ok {
		if matches, ok := profanity["matches"].([]interface{}); ok {
			log.Printf("Found %d profanity matches", len(matches))
			for _, match := range matches {
				if matchMap, ok := match.(map[string]interface{}); ok {
					matchText := matchMap["match"].(string)
					intensity := matchMap["intensity"].(string)
					matchType := matchMap["type"].(string)
					log.Printf("Profanity match: '%s' (type: %s, intensity: %s)",
						matchText, matchType, intensity)

					if intensity == "high" || intensity == "medium" {
						blocked = true
					}
				}
			}
		}
	}

	if personal, ok := result["personal"].(map[string]interface{}); ok {
		if matches, ok := personal["matches"].([]interface{}); ok && len(matches) > 0 {
			log.Printf("Found %d personal information matches", len(matches))
			blocked = true
		}
	}

	if link, ok := result["link"].(map[string]interface{}); ok {
		if matches, ok := link["matches"].([]interface{}); ok && len(matches) > 0 {
			log.Printf("Found %d suspicious link matches", len(matches))
			blocked = true
		}
	}
	if blocked {
		log.Printf("Text blocked by moderation")
	} else {
		log.Printf("Text passed moderation")
	}
	return !blocked
}

func CalculateSeverityPoints(contentType, intensity string) int {
	basePoints := map[string]int{
		"discriminatory": 40,
		"hate":           35,
		"sexual":         20,
		"inappropriate":  15,
		"offensive":      10,
	}

	intensityMultiplier := map[string]float64{
		"high":   1.0,
		"medium": 0.6,
		"low":    0.3,
	}

	base := basePoints[contentType]
	if base == 0 {
		base = 10
	}

	multiplier := intensityMultiplier[intensity]
	if multiplier == 0 {
		multiplier = 1.0
	}

	return int(float64(base) * multiplier)
}

func GetRecommendedAction(severityScore int, level int) string {
	switch level {
	case ModerationStrict:
		if severityScore >= 30 {
			return "block"
		} else if severityScore >= 15 {
			return "warn"
		}
		return "allow"

	case ModerationModerate:
		if severityScore >= 50 {
			return "block"
		} else if severityScore >= 25 {
			return "warn"
		}
		return "allow"

	case ModerationLenient:
		if severityScore >= 70 {
			return "block"
		} else if severityScore >= 40 {
			return "review"
		}
		return "allow"
	}
	return "allow"
}
