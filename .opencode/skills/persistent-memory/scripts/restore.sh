#!/bin/bash
# Restore from a specific checkpoint
# Usage: ./restore.sh [checkpoint-file]

set -e

MEMORY_DIR=".opencode/memory"
CHECKPOINT_DIR="$MEMORY_DIR/checkpoints"

if [[ -z "$1" ]]; then
    echo "Available checkpoints:"
    echo ""
    ls -lt "$CHECKPOINT_DIR"/*.md 2>/dev/null | head -10 || echo "No checkpoints found"
    echo ""
    echo "Usage: ./restore.sh <checkpoint-file>"
    echo "Example: ./restore.sh 2025-01-30-1200.md"
    exit 0
fi

CHECKPOINT_FILE="$CHECKPOINT_DIR/$1"

if [[ ! -f "$CHECKPOINT_FILE" ]]; then
    echo "Checkpoint not found: $CHECKPOINT_FILE"
    exit 1
fi

# Backup current latest before overwriting
if [[ -s "$CHECKPOINT_DIR/latest.md" ]]; then
    BACKUP="$CHECKPOINT_DIR/backup-$(date +%Y-%m-%d-%H%M).md"
    cp "$CHECKPOINT_DIR/latest.md" "$BACKUP"
    echo "Current state backed up to: $BACKUP"
fi

# Restore
cp "$CHECKPOINT_FILE" "$CHECKPOINT_DIR/latest.md"
echo "Restored from: $CHECKPOINT_FILE"
echo ""
echo "Contents:"
echo "---"
head -30 "$CHECKPOINT_DIR/latest.md"
echo "---"
