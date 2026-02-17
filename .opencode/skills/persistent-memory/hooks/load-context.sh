#!/bin/bash
# Session start hook - Reminds agent to load persistent memory
# This outputs a message that the agent will see

set -e

MEMORY_DIR=".opencode/memory"
CHECKPOINT_FILE="$MEMORY_DIR/checkpoints/latest.md"
TODOS_FILE="$MEMORY_DIR/todos.md"
DECISIONS_FILE="$MEMORY_DIR/decisions.md"

echo "=== PERSISTENT MEMORY AVAILABLE ==="
echo ""

# Check for checkpoint
if [[ -s "$CHECKPOINT_FILE" ]]; then
    echo "Checkpoint found: $CHECKPOINT_FILE"
    echo "Last modified: $(stat -c %y "$CHECKPOINT_FILE" 2>/dev/null || stat -f %Sm "$CHECKPOINT_FILE" 2>/dev/null || echo 'unknown')"
else
    echo "No checkpoint found. Starting fresh session."
fi

# Check for todos
if [[ -s "$TODOS_FILE" ]]; then
    PENDING=$(grep -c "^\- \[ \]" "$TODOS_FILE" 2>/dev/null || echo 0)
    echo "Todos found: $PENDING pending tasks"
else
    echo "No todos file found."
fi

# Check for decisions
if [[ -s "$DECISIONS_FILE" ]]; then
    DECISIONS=$(grep -c "^## " "$DECISIONS_FILE" 2>/dev/null || echo 0)
    echo "Decisions log: $DECISIONS entries"
fi

echo ""
echo ">>> ACTION: Read these files to restore context:"
echo "    - $CHECKPOINT_FILE"
echo "    - $TODOS_FILE"
echo "    - $DECISIONS_FILE"
echo "========================================"

# Reset tool count for new session
echo "0" > "$MEMORY_DIR/.tool_count"
