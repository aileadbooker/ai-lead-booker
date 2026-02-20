# Workflow Orchestration Directive

This directive defines how the AI (Orchestrator) operates within the 3-layer architecture.

## Architecture Overview

- **Layer 1: Directive (Directive Layer)**: Natural language SOPs in `directives/`.
- **Layer 2: Orchestration (Orchestrator)**: The AI reasoning and routing logic.
- **Layer 3: Execution (Execution Layer)**: Deterministic Python scripts in `execution/`.

## Operational SOP

1. **Check Directives**: When a task is assigned, first check `directives/` for an existing SOP.
2. **Identify Tools**: Check `execution/` for existing scripts that can fulfill the directive.
3. **Reasoning**: Map the user's intent to the directive's steps and orchestrate script execution.
4. **Deterministic Step**: Call tools in `execution/` with appropriate inputs. Capture outputs and handle errors.
5. **Self-Annealing**: If a script fails, analyze the error, fix the script in `execution/`, and update the corresponding `directives/` file with learnings.
6. **Persistence**: Store intermediate data in `.tmp/`.

## Important Rules
- Never perform complex deterministic work (scraping, multi-API auth, heavy data processing) directly in chat if a script can do it.
- Keep `directives/` as the single source of truth for "How to do things".
- Ensure `.env` is used for all sensitive configuration.
