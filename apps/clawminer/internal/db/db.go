package db

import (
	"database/sql"
	_ "embed"
	"log"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed schema.sql
var schemaSQL string

var (
	db   *sql.DB
	mu   sync.Mutex
)

// Open initializes the SQLite database and runs the embedded schema.
func Open(path string) error {
	mu.Lock()
	defer mu.Unlock()

	if db != nil {
		return nil // already open
	}

	var err error
	db, err = sql.Open("sqlite3", path+"?_journal_mode=WAL&_foreign_keys=ON")
	if err != nil {
		return err
	}

	// Single writer, multiple readers
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(schemaSQL); err != nil {
		db.Close()
		db = nil
		return err
	}

	log.Printf("[db] Opened %s", path)
	return nil
}

// Close shuts down the database connection.
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if db != nil {
		db.Close()
		db = nil
		log.Println("[db] Closed")
	}
}

// DB returns the underlying *sql.DB for direct queries.
func DB() *sql.DB {
	return db
}
