//go:build nocgo

package db

import _ "modernc.org/sqlite"

const driverName = "sqlite"
