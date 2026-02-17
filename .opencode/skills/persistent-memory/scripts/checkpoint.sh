#!/bin/bash
# Manual checkpoint command
# Usage: ./checkpoint.sh [optional-label]

set -e

MEMORY_DIR=".opencode/memory"
CHECKPOINT_DIR="$MEMORY_DIR/checkpoints"
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
LABEL="${1:-$TIMESTAMP}"

mkdir -p "$CHECKPOINT_DIR"

# Copy current latest to timestamped backup
if [[ -s "$CHECKPOINT_DIR/latest.md" ]]; then
    cp "$CHECKPOINT_DIR/latest.md" "$CHECKPOINT_DIR/$TIMESTAMP.md"
    echo "Checkpoint saved: $CHECKPOINT_DIR/$TIMESTAMP.md"
    
    # Prune old checkpoints (keep last 5)
    ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null | grep -v latest.md | tail -n +6 | xargs -r rm -f
    echo "Old checkpoints pruned (keeping last 5)"
else
    echo "No latest.md found. Create one first by updating:"
    echo "  $CHECKPOINT_DIR/latest.md"
fi

echo ""
echo "To create/update checkpoint, edit: $CHECKPOINT_DIR/latest.md"
