package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

// ─── Request / Response Types ────────────────────────────────────────────────

type ModerationRequest struct {
	ID        string   `json:"id"`
	Content   string   `json:"content"`
	MediaURLs []string `json:"media_urls"`
}

type ModerationError struct {
	Type       string  `json:"type"`
	Message    string  `json:"message"`
	Confidence float64 `json:"confidence,omitempty"`
}

type FileResult struct {
	Filename string                 `json:"filename"`
	Passed   bool                   `json:"passed"`
	Category string                 `json:"category"`
	Errors   []ModerationError      `json:"errors"`
	Details  map[string]interface{} `json:"details"`
}

type Response struct {
	ID      string       `json:"id"`
	Content string       `json:"content"`
	Files   []FileResult `json:"files"`
	Text    FileResult   `json:"text"`
	Passed  bool         `json:"passed"`
	Reason  string       `json:"reason,omitempty"`
}

// ─── OpenAI API Types ─────────────────────────────────────────────────────────

type openAIModerationResult struct {
	Flagged    bool            `json:"flagged"`
	Categories map[string]bool `json:"categories"`
}

type openAIResponse struct {
	Results []openAIModerationResult `json:"results"`
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

func moderateText(content string) FileResult {
	isBanned, reason := OpenAiModerateText(content)
	result := FileResult{
		Passed:  !isBanned,
		Details: map[string]interface{}{},
	}
	if isBanned {
		result.Category = reason
		result.Errors = []ModerationError{{Type: "text", Message: reason}}
	}
	return result
}

func moderateImageURL(imageURL string) FileResult {
	isBanned, reason := OpenAiModerateImage(imageURL)
	result := FileResult{
		Filename: imageURL,
		Passed:   !isBanned,
		Details:  map[string]interface{}{},
	}
	if isBanned {
		result.Category = reason
		result.Errors = []ModerationError{{Type: "image", Message: reason}}
	}
	return result
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

func moderationHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ModerationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Failed to parse JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ID == "" {
		http.Error(w, "Missing id field", http.StatusBadRequest)
		return
	}

	log.Printf("Received request for post ID %s with %d media URLs", req.ID, len(req.MediaURLs))

	// Moderate text
	textResult := moderateText(req.Content)
	log.Printf("Text moderation for post %s: passed=%v", req.ID, textResult.Passed)

	// Moderate images by URL
	fileResults := []FileResult{}
	postPassed := textResult.Passed

	for i, url := range req.MediaURLs {
		log.Printf("Processing media [%d/%d]: %s", i+1, len(req.MediaURLs), url)

		fileResult := moderateImageURL(url)
		fileResults = append(fileResults, fileResult)
		postPassed = postPassed && fileResult.Passed

		if fileResult.Passed {
			log.Printf("✅ Media [%d] PASSED", i+1)
		} else {
			log.Printf("❌ Media [%d] FAILED: %s", i+1, fileResult.Category)
		}
	}

	resp := Response{
		ID:      req.ID,
		Content: req.Content,
		Text:    textResult,
		Files:   fileResults,
		Passed:  postPassed,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)

	if postPassed {
		log.Printf("✅ Post ID %s PASSED moderation", req.ID)
	} else {
		log.Printf("❌ Post ID %s FAILED moderation", req.ID)
	}

	sendCallback(resp)
}

func sendCallback(resp Response) {
	callbackURL := os.Getenv("CALLBACK_URL")
	if callbackURL == "" {
		callbackURL = "http://127.0.0.1:8000/api/v1/posts/moderation-callback/"
	}

	payload, err := json.Marshal(resp)
	if err != nil {
		log.Printf("Failed to marshal callback payload: %v", err)
		return
	}

	req, err := http.NewRequest("POST", callbackURL, bytes.NewBuffer(payload))
	if err != nil {
		log.Printf("Failed to create callback request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send callback: %v", err)
		return
	}
	defer res.Body.Close()

	log.Printf("Callback sent to Django, status: %d", res.StatusCode)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func initLogger() *os.File {
	file, err := os.OpenFile("moderation.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("Failed to open log file: %v", err)
	}
	multi := io.MultiWriter(file, os.Stdout)
	log.SetOutput(multi)
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	return file
}

func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ .env not loaded:", err)
	} else {
		log.Println("✅ .env loaded")
	}
}

func main() {
	logFile := initLogger()
	defer logFile.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/moderation", moderationHandler)
	http.HandleFunc("/health", healthHandler)
	log.Printf("🚀 Moderation service running on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}