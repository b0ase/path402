BINARY     := clawminerd
VERSION    := 0.2.0
BUILD_DIR  := ./build
LDFLAGS    := -ldflags "-s -w -X main.Version=$(VERSION)"
CGO        := CGO_ENABLED=1

.PHONY: all build clean test run release checksums install-gomobile bind-android bind-ios

all: build

build:
	$(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/clawminerd/

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-arm64 ./cmd/clawminerd/

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-darwin-amd64 ./cmd/clawminerd/

build-linux-amd64:
	GOOS=linux GOARCH=amd64 $(CGO) CC=x86_64-linux-musl-gcc go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-amd64 ./cmd/clawminerd/

build-linux-arm64:
	GOOS=linux GOARCH=arm64 $(CGO) CC=aarch64-linux-musl-gcc go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-linux-arm64 ./cmd/clawminerd/

build-windows-amd64:
	GOOS=windows GOARCH=amd64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-windows-amd64.exe ./cmd/clawminerd/

build-android:
	GOOS=android GOARCH=arm64 $(CGO) CC=$(ANDROID_NDK_HOME)/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android21-clang \
		go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-android-arm64 ./cmd/clawminerd/

# Build all release targets (run on CI or locally with cross-compilers)
release: clean
	@mkdir -p $(BUILD_DIR)
	@echo "Building ClawMinerd v$(VERSION) release binaries..."
	GOOS=darwin GOARCH=arm64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-v$(VERSION)-darwin-arm64 ./cmd/clawminerd/
	GOOS=darwin GOARCH=amd64 $(CGO) go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY)-v$(VERSION)-darwin-amd64 ./cmd/clawminerd/
	@echo "Done. Binaries in $(BUILD_DIR)/"
	@ls -lh $(BUILD_DIR)/

checksums:
	cd $(BUILD_DIR) && shasum -a 256 $(BINARY)-* > checksums.txt
	@cat $(BUILD_DIR)/checksums.txt

run: build
	$(BUILD_DIR)/$(BINARY)

test:
	$(CGO) go test ./...

install-gomobile:
	go install golang.org/x/mobile/cmd/gomobile@latest
	go install golang.org/x/mobile/cmd/gobind@latest
	gomobile init

bind-android:
	@mkdir -p android
	$(CGO) gomobile bind \
		-target=android/arm64 \
		-androidapi 21 \
		-ldflags "-s -w" \
		-o android/clawminer.aar \
		./mobile/

bind-ios:
	@mkdir -p ios
	$(CGO) gomobile bind \
		-target=ios/arm64 \
		-iosversion 15.0 \
		-ldflags "-s -w" \
		-o ios/Clawminer.xcframework \
		./mobile/

clean:
	rm -rf $(BUILD_DIR)
