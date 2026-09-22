test:
	GO_ENV=test go test ./...
test\:all:
	@sh tests/test.sh
build_web:
	cd web && pnpm install --frozen-lockfile --ignore-scripts && pnpm build
perform:
	@go run main.go -- perform -m demo -c ./gobackup_test.yml
run:
	GO_ENV=dev go run main.go -- run --config ./gobackup_test.yml
start:
	GO_ENV=dev go run main.go -- start --config ./gobackup_test.yml
build: build_web
	go build -o dist/gobackup
build_linux_amd64: build_web
	mkdir -p dist
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o dist/gobackup-linux-amd64 .
dev:
	cd web && yarn dev
