package db

import "time"

func GetConfig(key string) (string, error) {
	var val string
	err := db.QueryRow(`SELECT value FROM config WHERE key = ?`, key).Scan(&val)
	if err != nil {
		return "", err
	}
	return val, nil
}

func SetConfig(key, value string) error {
	_, err := db.Exec(`
		INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, time.Now().Unix())
	return err
}

func GetNodeID() (string, error) {
	return GetConfig("node_id")
}
