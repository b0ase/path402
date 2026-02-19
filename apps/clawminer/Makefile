BINARY     := clawminerd
VERSION    := 0.1.0
BUILD_DIR  := ./build
LDFLAGS    := -ldflags "-s -w -X main.Version=$(VERSION)"
CGO        := CGO_ENABLED=1

.PHONY: all build clean test run

all: build

build:
	$(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/clawminerd/

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-arm64 ./cmd/clawminerd/

build-linux-amd64:
	GOOS=linux GOARCH=amd64 $(CGO) CC=x86_64-linux-musl-gcc go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-amd64 ./cmd/clawminerd/

build-android:
	GOOS=android GOARCH=arm64 $(CGO) CC=$(ANDROID_NDK_HOME)/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android21-clang \
		go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-android-arm64 ./cmd/clawminerd/

run: build
	$(BUILD_DIR)/$(BINARY)

test:
	$(CGO) go test ./...

clean:
	rm -rf $(BUILD_DIR)
