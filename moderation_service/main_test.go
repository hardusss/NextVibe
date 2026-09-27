package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCallbackCarriesTheSharedSecret(t *testing.T) {
	got := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.Header.Get("X-Moderation-Secret")
	}))
	defer server.Close()

	t.Setenv("CALLBACK_URL", server.URL)
	t.Setenv("MODERATION_CALLBACK_SECRET", "s3cret")
	sendCallback(Response{ID: "1", Passed: true})

	if secret := <-got; secret != "s3cret" {
		t.Fatalf("callback header = %q, want the shared secret", secret)
	}
}

func TestCallbackWithoutASecretSendsNoHeader(t *testing.T) {
	got := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.Header.Get("X-Moderation-Secret")
	}))
	defer server.Close()

	t.Setenv("CALLBACK_URL", server.URL)
	t.Setenv("MODERATION_CALLBACK_SECRET", "")
	sendCallback(Response{ID: "1", Passed: true})

	if secret := <-got; secret != "" {
		t.Fatalf("callback header = %q, want none", secret)
	}
}
