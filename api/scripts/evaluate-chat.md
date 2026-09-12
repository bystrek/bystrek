# Chat model evaluation

Use a dedicated evaluation user with a calendar containing only synthetic
events. The runner never confirms a calendar mutation.

On the home server, use the `evaluate-bystrek-model` wrapper documented in
`infra/README.md`:

```sh
evaluate-bystrek-model qwen3:1.7b
```

It passes `EVAL_AUTH_TOKEN` only to the runner process and sets
`EVAL_RESET_HISTORY=true`, which deletes only the evaluation user's history
before every independent scenario. The runner reads the API container's active
`LLM_MODEL`; its JSON results are saved under `~/bystrek/evaluations/`.

Compare `toolMatch`, `elapsedMs`, `metrics`, and captured replies for each
candidate.
