package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"bytes"
	"github.com/joho/godotenv"
)

// FileInfo represents metadata about uploaded files
type FileInfo struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
}

// ModerationError represents a single moderation error
type ModerationError struct {
	Type       string  `json:"type"`
	Message    string  `json:"message"`
	Confidence float64 `json:"confidence,omitempty"`
}

// FileResult holds moderation results for a file
type FileResult struct {
	Filename string                 `json:"filename"`
	Passed   bool                   `json:"passed"`
	Errors   []ModerationError      `json:"errors"`
	Details  map[string]interface{} `json:"details"`
}

// Response represents the moderation result for a post
type Response struct {
	Id      string       `json:"id"`
	Content string       `json:"content"`
	Files   []FileResult `json:"files"`
	Text    FileResult   `json:"text"`
	Passed  bool         `json:"passed"`
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

func moderationHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(64 << 20) // 64MB limit
	if err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	id := r.FormValue("id")
	content := r.FormValue("content")

	if id == "" {
		http.Error(w, "Missing id field", http.StatusBadRequest)
		return
	}

	log.Printf("Received moderation request for post ID %s", id)

	// Moderate text
	textResult := ModerateText(content)
	log.Printf("Text moderation result: passed=%v", textResult.Passed)

	// Moderate files
	files := r.MultipartForm.File["files"]
	fileResults := []FileResult{}
	postPassed := textResult.Passed

	for _, fh := range files {
		tempPath := "./" + fh.Filename
		src, err := fh.Open()
		if err != nil {
			log.Printf("Failed to open file %s: %v", fh.Filename, err)
			continue
		}

		dst, _ := os.Create(tempPath)
		_, _ = io.Copy(dst, src)
		src.Close()
		dst.Close()

		var fileResult FileResult
		ext := filepath.Ext(fh.Filename)
		if isImage(ext) {
			fileResult = ModerateImage(tempPath)
		} else if isVideo(ext) {
			fileResult = ModerateVideo(tempPath)
		} else {
			fileResult = FileResult{
				Filename: fh.Filename,
				Passed:   false,
				Details:  map[string]interface{}{"error": "Unsupported file type"},
			}
		}

		fileResults = append(fileResults, fileResult)
		postPassed = postPassed && fileResult.Passed
		os.Remove(tempPath)
		log.Printf("File %s moderation passed=%v", fh.Filename, fileResult.Passed)
	}

	resp := Response{
		Id:      id,
		Content: content,
		Text:    textResult,
		Files:   fileResults,
		Passed:  postPassed,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)

	if postPassed {
		log.Printf("Post ID %s passed moderation", id)
	} else {
		log.Printf("Post ID %s failed moderation", id)
	}
	callbackURL := "http://127.0.0.1:8000/api/v1/posts/moderation-callback/"
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
		log.Printf("Failed to send callback request: %v", err)
		return
	}
	defer res.Body.Close()

	log.Printf("Callback sent to backend, status code: %d", res.StatusCode)

}

func main() {
	_ = godotenv.Load()
	file := initLogger()
	defer file.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/moderation", moderationHandler)
	log.Printf("Moderation service running on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
