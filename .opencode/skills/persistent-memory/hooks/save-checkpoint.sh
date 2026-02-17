#!/bin/bash
# PostToolUse hook - Auto-saves checkpoint periodically
# Triggers after Edit/Write operations

set -e

MEMORY_DIR=".opencode/memory"
COUNT_FILE="$MEMORY_DIR/.tool_count"
CHECKPOINT_DIR="$MEMORY_DIR/checkpoints"

# Ensure directories exist
mkdir -p "$CHECKPOINT_DIR"

# Increment tool call count
COUNT=$(($(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1))
echo "$COUNT" > "$COUNT_FILE"

# Auto-checkpoint every 20 edits
if (( COUNT % 20 == 0 )); then
    TIMESTAMP=$(date +%Y-%m-%d-%H%M)
    
    # Only save if latest.md exists and has content
    if [[ -s "$CHECKPOINT_DIR/latest.md" ]]; then
        cp "$CHECKPOINT_DIR/latest.md" "$CHECKPOINT_DIR/$TIMESTAMP.md"
        
        # Prune old checkpoints (keep last 5)
        ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null | grep -v latest.md | tail -n +6 | xargs -r rm -f
        
        echo "Auto-checkpoint saved: $TIMESTAMP (edit #$COUNT)"
    fi
fi

# Remind to update checkpoint every 50 edits
if (( COUNT % 50 == 0 )); then
    echo ""
    echo ">>> REMINDER: Consider updating .opencode/memory/checkpoints/latest.md"
    echo ">>> $COUNT file edits since session start. Good time to checkpoint."
    echo ""
fi
