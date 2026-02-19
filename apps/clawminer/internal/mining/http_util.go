package mining

import (
	"encoding/json"
	"io"
	"net/http"
	"time"
)

var defaultHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
}

func decodeJSON(r io.Reader, v interface{}) error {
	return json.NewDecoder(r).Decode(v)
}
