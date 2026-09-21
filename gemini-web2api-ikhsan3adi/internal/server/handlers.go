package server

import (
	"net/http"

	"github.com/ikhsan3adi/gemini-web2api/internal/models"
)

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"version": a.Version,
		"models":  models.SortedModelNames(),
	})
}

func (a *App) handleModels(w http.ResponseWriter, r *http.Request) {
	var data []map[string]any
	for _, name := range models.SortedModelNames() {
		m := models.MODELS[name]
		data = append(data, map[string]any{
			"id":          name,
			"object":      "model",
			"created":     1700000000,
			"owned_by":    "google",
			"description": m.Desc,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list",
		"data":   data,
	})
}

func (a *App) handleGoogleModels(w http.ResponseWriter, r *http.Request) {
	var modelList []map[string]any
	for _, name := range models.SortedModelNames() {
		m := models.MODELS[name]
		modelList = append(modelList, map[string]any{
			"name":                        "models/" + name,
			"displayName":                 name,
			"description":                 m.Desc,
			"supportedGenerationMethods": []string{"generateContent", "streamGenerateContent"},
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"models": modelList,
	})
}
