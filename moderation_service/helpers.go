package main

import (
	cryptorand "crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"encoding/json"
)

func GenerateRandomString(length int) string {
	b := make([]byte, length)
	cryptorand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:length]
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

func EvaluateMedia(result map[string]interface{}) bool {
	resultJSON, _ := json.MarshalIndent(result, "", "  ")
	fmt.Printf("Sightengine Response:\n%s\n", resultJSON)

	if status, ok := result["status"].(string); ok && status == "failure" {
		fmt.Println("❌ API returned failure status")
		return false
	}

	if nudity, ok := result["nudity"].(map[string]interface{}); ok {
		if raw, ok := nudity["raw"].(float64); ok {
			fmt.Printf("Nudity raw score: %.3f\n", raw)
			if raw > 0.6 {
				fmt.Println("❌ FAILED: High nudity raw score")
				return false
			}
		}
		
		if partial, ok := nudity["partial"].(float64); ok {
			fmt.Printf("Nudity partial score: %.3f\n", partial)
			if partial > 0.7 {
				fmt.Println("❌ FAILED: High partial nudity")
				return false
			}
		}

		if sexual, ok := nudity["sexual_activity"].(float64); ok {
			fmt.Printf("Sexual activity score: %.3f\n", sexual)
			if sexual > 0.6 {
				fmt.Println("❌ FAILED: Sexual activity detected")
				return false
			}
		}

		if display, ok := nudity["sexual_display"].(float64); ok {
			fmt.Printf("Sexual display score: %.3f\n", display)
			if display > 0.6 {
				fmt.Println("❌ FAILED: Sexual display detected")
				return false
			}
		}
	}

	if weapon, ok := result["weapon"].(float64); ok {
		fmt.Printf("Weapon score: %.3f\n", weapon)
		if weapon > 0.7 {
			fmt.Println("❌ FAILED: Weapon detected")
			return false
		}
	}

	if alcohol, ok := result["alcohol"].(float64); ok {
		fmt.Printf("Alcohol score: %.3f\n", alcohol)
		if alcohol > 0.8 {
			fmt.Println("❌ FAILED: Alcohol detected")
			return false
		}
	}

	if offensive, ok := result["offensive"].(map[string]interface{}); ok {
		if prob, ok := offensive["prob"].(float64); ok {
			fmt.Printf("Offensive prob: %.3f\n", prob)
			if prob > 0.7 {
				fmt.Println("❌ FAILED: Offensive content")
				return false
			}
		}
	}

	if wad, ok := result["wad"].(map[string]interface{}); ok {
		if wadWeapon, ok := wad["weapon"].(float64); ok && wadWeapon > 0.7 {
			fmt.Println("❌ FAILED: WAD weapon detected")
			return false
		}
		if wadAlcohol, ok := wad["alcohol"].(float64); ok && wadAlcohol > 0.8 {
			fmt.Println("❌ FAILED: WAD alcohol detected")
			return false
		}
		if wadDrugs, ok := wad["drugs"].(float64); ok && wadDrugs > 0.7 {
			fmt.Println("❌ FAILED: WAD drugs detected")
			return false
		}
	}
	
	fmt.Println("✅ PASSED: Content is safe")
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
	log.Printf("Using SIGHTENGINE_USER=%s", user)
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

func isImage(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".webp"
}

func isVideo(ext string) bool {
	ext = strings.ToLower(ext)
	return ext == ".mp4" || ext == ".mov" || ext == ".avi" || ext == ".webm"
}

func getExtensionFromContentType(contentType string) string {
	contentType = strings.ToLower(strings.Split(contentType, ";")[0])
	switch contentType {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/x-msvideo":
		return ".avi"
	case "video/webm":
		return ".webm"
	default:
		return ".jpg" 
	}
}

