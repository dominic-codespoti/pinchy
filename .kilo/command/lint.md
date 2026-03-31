# Lint Command

Runs linting and formatting checks same as CI.

## Usage

```bash
kilo lint
```

## What it does

- `cargo fmt -- --check`
- `cargo clippy --no-default-features -- -D warnings`

## Fix mode

To auto-fix issues:

```bash
cargo fmt
cargo clippy --no-default-features --fix
```
