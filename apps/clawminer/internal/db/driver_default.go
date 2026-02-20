//go:build !android

package db

import _ "github.com/mattn/go-sqlite3"

const driverName = "sqlite3"
