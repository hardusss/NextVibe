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

	"github.com/joho/godotenv"
)

type ModerationRequest struct {
	ID        string   `json:"id"`
	Content   string   `json:"content"`
	MediaURLs []string `json:"media_urls"` 
}

type FileResult struct {
	Filename string                 `json:"filename"`
	Passed   bool                   `json:"passed"`
	Category string                 `json:"category"`
	Errors   []ModerationError      `json:"errors"`
	Details  map[string]interface{} `json:"details"`
}


type ModerationError struct {
	Type       string  `json:"type"`
	Message    string  `json:"message"`
	Confidence float64 `json:"confidence,omitempty"`
}

type Response struct {
	ID      string       `json:"id"`
	Content string       `json:"content"`
	Files   []FileResult `json:"files"`
	Text    FileResult   `json:"text"`
	Passed  bool         `json:"passed"`
	Reason  string       `json:"reason,omitempty"` 
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

func downloadFile(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status: %s", resp.Status)
	}

	parts := strings.Split(url, "/")
	filename := parts[len(parts)-1]

	if idx := strings.Index(filename, "?"); idx != -1 {
		filename = filename[:idx]
	}
	
	if !strings.Contains(filename, ".") {
		contentType := resp.Header.Get("Content-Type")
		ext := getExtensionFromContentType(contentType)
		filename = filename + ext
		log.Printf("   No extension in URL, detected from Content-Type: %s -> %s", contentType, ext)
	}

	tempPath := filepath.Join(os.TempDir(), filename)
	out, err := os.Create(tempPath)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to save file: %w", err)
	}

	log.Printf("   Downloaded to: %s", tempPath)
	return tempPath, nil
}


func moderationHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	contentType := r.Header.Get("Content-Type")
	var id, content string
	var mediaURLs []string
	var uploadedFiles []*multipart.FileHeader

	if strings.Contains(contentType, "application/json") {
		var req ModerationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Failed to parse JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		id = req.ID
		content = req.Content
		mediaURLs = req.MediaURLs
		log.Printf("✅ Received JSON request for post ID %s with %d media URLs", id, len(mediaURLs))
		for i, url := range mediaURLs {
			log.Printf("   Media [%d]: %s", i+1, url)
		}
	} else {

		err := r.ParseMultipartForm(64 << 20) // 64MB limit
		if err != nil {
			http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
			return
		}
		id = r.FormValue("id")
		content = r.FormValue("content")
		uploadedFiles = r.MultipartForm.File["files"]
		log.Printf("Received multipart request for post ID %s with %d files", id, len(uploadedFiles))
	}

	if id == "" {
		http.Error(w, "Missing id field", http.StatusBadRequest)
		return
	}

	textResult := ModerateText(content)
	log.Printf("Text moderation for post %s: passed=%v", id, textResult.Passed)

	fileResults := []FileResult{}
	postPassed := textResult.Passed

	for i, url := range mediaURLs {
		log.Printf("📸 Processing media [%d/%d]: %s", i+1, len(mediaURLs), url)
		
		if strings.Contains(url, "cloudinary.com") {
			log.Printf("   🚀 Using direct Cloudinary URL (no download)")

			moderationURL := url
			if !strings.Contains(url, ".jpg") && !strings.Contains(url, ".png") && !strings.Contains(url, ".webp") {
				moderationURL = url + ".jpg"
			}
			
			fileResult := ModerateImageByURL(moderationURL)
			fileResult.Filename = url
			fileResults = append(fileResults, fileResult)
			postPassed = postPassed && fileResult.Passed
			
			if fileResult.Passed {
				log.Printf("✅ Media [%d] PASSED", i+1)
			} else {
				log.Printf("❌ Media [%d] FAILED", i+1)
			}
			continue
		}

		tempPath, err := downloadFile(url)
		if err != nil {
			log.Printf("❌ Failed to download %s: %v", url, err)
			fileResults = append(fileResults, FileResult{
				Filename: url,
				Passed:   false,
				Details:  map[string]interface{}{"error": "Download failed: " + err.Error()},
			})
			postPassed = false
			continue
		}

		fileResult := moderateFile(tempPath, url)
		fileResults = append(fileResults, fileResult)
		postPassed = postPassed && fileResult.Passed
		
		if fileResult.Passed {
			log.Printf("✅ Media [%d] PASSED", i+1)
		} else {
			log.Printf("❌ Media [%d] FAILED", i+1)
		}

		os.Remove(tempPath)
	}

	for _, fh := range uploadedFiles {
		tempPath := filepath.Join(os.TempDir(), fh.Filename)
		src, err := fh.Open()
		if err != nil {
			log.Printf("Failed to open file %s: %v", fh.Filename, err)
			continue
		}

		dst, _ := os.Create(tempPath)
		_, _ = io.Copy(dst, src)
		src.Close()
		dst.Close()

		fileResult := moderateFile(tempPath, fh.Filename)
		fileResults = append(fileResults, fileResult)
		postPassed = postPassed && fileResult.Passed

		os.Remove(tempPath)
	}

	resp := Response{
		ID:      id,
		Content: content,
		Text:    textResult,
		Files:   fileResults,
		Passed:  postPassed,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)

	if postPassed {
		log.Printf("Post ID %s PASSED moderation", id)
	} else {
		log.Printf("Post ID %s FAILED moderation", id)
	}

	sendCallback(resp)
}

func moderateFile(filePath, displayName string) FileResult {
	ext := filepath.Ext(filePath)
	log.Printf("   File extension: %s", ext)
	
	if isImage(ext) {
		log.Printf("   Moderating as IMAGE...")
		result := ModerateImage(filePath)
		result.Filename = displayName
		
		if details, ok := result.Details["nudity"].(map[string]interface{}); ok {
			if raw, ok := details["raw"].(float64); ok {
				log.Printf("   📊 Nudity raw score: %.3f", raw)
			}
		}
		
		log.Printf("   Image %s moderation: passed=%v", displayName, result.Passed)
		return result
	} else if isVideo(ext) {
		log.Printf("   Moderating as VIDEO...")
		result := ModerateVideo(filePath)
		result.Filename = displayName
		log.Printf("   Video %s moderation: passed=%v", displayName, result.Passed)
		return result
	}
	
	log.Printf("   ❌ Unsupported file type: %s", ext)
	return FileResult{
		Filename: displayName,
		Passed:   false,
		Details:  map[string]interface{}{"error": "Unsupported file type: " + ext},
	}
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


func main() {
	_ = godotenv.Load()
	file := initLogger()
	defer file.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/moderation", moderationHandler)
	http.HandleFunc("/test-image", testImageHandler) 
	http.HandleFunc("/health", healthHandler)
	log.Printf("🚀 Moderation service running on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// healthHandler for check working service
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// testImageHandler for testing
func testImageHandler(w http.ResponseWriter, r *http.Request) {
	imageURL := r.URL.Query().Get("url")
	if imageURL == "" {
		http.Error(w, "Missing url parameter", http.StatusBadRequest)
		return
	}

	log.Printf("Testing image moderation for URL: %s", imageURL)
	result := ModerateImageByURL(imageURL)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}