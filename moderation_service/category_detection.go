package main

import (
	"encoding/json"
	"os"
	"strings"
)

type CategoryKeywords map[string][]string

// DetectCategories determines the categories of text content based on keywords
func DetectCategories(text string) []string {
	// Load category keywords
	keywordsFile, err := os.ReadFile("category_keywords.json")
	if err != nil {
		return []string{"universal"} // Return universal category if can't load keywords
	}

	var categories CategoryKeywords
	if err := json.Unmarshal(keywordsFile, &categories); err != nil {
		return []string{"universal"} // Return universal category if can't parse keywords
	}

	// Convert text to lowercase for case-insensitive matching
	text = strings.ToLower(text)

	// Store matching categories
	var matchingCategories []string

	// Check each category for matches
	for category, keywords := range categories {
		if category == "universal" {
			continue // Skip universal category in matching
		}
		for _, keyword := range keywords {
			if strings.Contains(text, strings.ToLower(keyword)) {
				matchingCategories = append(matchingCategories, category)
				break // One match is enough to include the category
			}
		}
	}

	// If no categories match, return universal
	if len(matchingCategories) == 0 {
		return []string{"universal"}
	}

	return matchingCategories
}
