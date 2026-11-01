package sample

import (
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/pkg/errors"
)

var toolName = regexp.MustCompile(`^[-A-Za-z0-9_]{1,128}$`)

// Image limits: a request carries at most MaxRequestImages (8 MiB together), a tool result at most
// MaxToolImages (4 MiB together), and one call's conversation at most MaxCallImages.
const (
	MaxRequestImages = 4
	MaxToolImages    = 2
	MaxCallImages    = 8
)

// ValidateImages checks prepared images: JPEG, base64, non-empty, at most n of them and limit bytes together.
func ValidateImages(images []Image, n, limit int) error {
	if len(images) > n {
		return errors.Errorf("At most %d images", n)
	}
	total := 0
	for _, image := range images {
		raw, err := base64.StdEncoding.DecodeString(image.Data)
		if err != nil || image.MimeType != "image/jpeg" || len(raw) == 0 {
			return errors.New("Invalid prepared image")
		}
		total += len(raw)
	}
	if total > limit {
		return errors.Errorf("Prepared images exceed %d MiB", limit>>20)
	}
	return nil
}

// ValidateRequest bounds a page-supplied sampling request.
func ValidateRequest(r Request) error {
	if err := ValidateImages(r.Images, MaxRequestImages, 8<<20); err != nil {
		return err
	}
	var text string
	if json.Unmarshal(r.Input, &text) != nil {
		var turns []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		if err := json.Unmarshal(r.Input, &turns); err != nil || len(turns) == 0 {
			return errors.New("Input must be text or turns")
		}
		if turns[0].Role != "user" || turns[len(turns)-1].Role != "user" {
			return errors.New("Turns must begin and end with user")
		}
		for _, t := range turns {
			if t.Role != "user" && t.Role != "assistant" {
				return errors.New("Invalid turn role")
			}
			text += t.Content
		}
	}
	if strings.TrimSpace(text) == "" || len(text) > 262144 {
		return errors.New("Prompt is empty or exceeds 262144 UTF-8 bytes")
	}
	if r.Options.ModelTier != "quick" && r.Options.ModelTier != "default" && r.Options.ModelTier != "complex" {
		return errors.New("Invalid model tier")
	}
	if r.Options.Effort != "" && r.Options.Effort != "low" && r.Options.Effort != "medium" && r.Options.Effort != "high" {
		return errors.New("Invalid effort")
	}
	if len(r.Tools) > 16 {
		return errors.New("At most 16 tools")
	}
	names := map[string]bool{}
	for _, t := range r.Tools {
		if !toolName.MatchString(t.Name) || names[t.Name] || len(t.Description) > 1024 || len(t.InputSchema) > 4096 {
			return errors.New("Invalid tool descriptor")
		}
		if len(t.InputSchema) > 0 {
			var schema map[string]any
			if json.Unmarshal(t.InputSchema, &schema) != nil || schema["type"] != "object" {
				return errors.New("Tool schema must describe an object")
			}
		}
		names[t.Name] = true
	}
	return nil
}
